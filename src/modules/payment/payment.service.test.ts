import { beforeEach, describe, expect, it, vi } from "vitest";

import { type IpAllowList, parseAllowList } from "@/lib/ip-allowlist";

import { sign } from "./providers/vnpay";

vi.mock("server-only", () => ({}));
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));
const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
vi.mock("@/lib/logger", () => ({ logger }));
const captureMessage = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureMessage }));
// Upstash for the refused-source alert window: SET NX answers "OK" once per key, then null.
const redis = vi.hoisted(() => ({ mode: "up" as "up" | "down" | "unconfigured", keys: new Set<string>() }));
vi.mock("@/lib/redis", () => ({
  redisPipeline: async (commands: (string | number)[][]) => {
    if (redis.mode === "unconfigured") return { configured: false };
    if (redis.mode === "down") return { configured: true, ok: false };
    return {
      configured: true,
      ok: true,
      results: commands.map(([, key]) => (redis.keys.has(String(key)) ? null : (redis.keys.add(String(key)), "OK"))),
    };
  },
}));
const config = {
  tmnCode: "CITEST01",
  hashSecret: "ci-only-vnpay-secret-0123456789",
  paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  returnUrl: "https://example.test/api/payments/vnpay/return",
};
const configState = {
  vnpay: config as typeof config | null,
  bank: { provider: "sepay", secret: "a-long-bank-webhook-secret" } as { provider: "sepay" | "casso"; secret: string } | null,
  allowList: { mode: "off" } as IpAllowList,
};
vi.mock("./payment.config", () => ({
  vnpayConfig: () => configState.vnpay,
  bankWebhookConfig: () => configState.bank,
  webhookAllowList: () => configState.allowList,
}));

type Result = { data: unknown; error: null | { code?: string; message?: string } };
const fn = (data: unknown) => vi.fn(async (...args: unknown[]): Promise<Result> => (void args, { data, error: null }));
const payment = { id: "p-1", booking_id: "b-1", amount: 12_900_000, status: "pending", kind: "full", bookings: { code: "PTA-2611-0042", locale: "vi", tour_id: "t-1" } };
const repo = {
  findPaymentByReference: fn(payment),
  recordPaymentEvent: fn({ result: "recorded", booking_id: "b-1", status: "confirmed", needs_attention: false }),
  bankAccountSetting: fn(null),
  bookingTour: fn({ tour_id: "t-1" }),
};
vi.mock("./payment.repository", () => repo);
const notifyBooking = vi.hoisted(() => vi.fn());
vi.mock("@/modules/booking/booking-emails.service", () => ({ notifyBooking }));

const { availableMethods, bankWebhookGate, handleBankWebhook, handleVnpayIpn, receiveVnpayIpn } = await import("./payment.service");

/** An enforced allow-list (documentation ranges) and request headers from a given address. */
const PROVIDER_RANGE = parseAllowList("203.0.113.0/24, 2001:db8::/32").list;
const from = (ip: string, extra: Record<string, string> = {}) => new Headers({ "x-forwarded-for": ip, ...extra });

const ipn = (patch: Record<string, string> = {}) => {
  const params = {
    vnp_Amount: "1290000000",
    vnp_TmnCode: "CITEST01",
    vnp_TxnRef: "PTA2611004201",
    vnp_TransactionNo: "14012345",
    vnp_ResponseCode: "00",
    vnp_TransactionStatus: "00",
    ...patch,
  };
  return { ...params, vnp_SecureHash: sign(params, config.hashSecret) };
};

beforeEach(() => {
  vi.clearAllMocks();
  configState.vnpay = config;
  configState.bank = { provider: "sepay", secret: "a-long-bank-webhook-secret" };
  configState.allowList = { mode: "off" };
  redis.mode = "up";
  redis.keys.clear();
  repo.findPaymentByReference.mockResolvedValue({ data: payment, error: null });
  repo.recordPaymentEvent.mockResolvedValue({ data: { result: "recorded", booking_id: "b-1", status: "confirmed", needs_attention: false }, error: null });
});

describe("VNPay IPN", () => {
  it("records a valid success and answers 00", async () => {
    expect(await handleVnpayIpn(ipn())).toEqual({ RspCode: "00", Message: "Confirm Success" });
    expect(repo.recordPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "vnpay", reference: "PTA2611004201", amount: 12_900_000, succeeded: true, eventKey: "PTA2611004201:14012345" }),
    );
    expect(revalidateTag).toHaveBeenCalledWith("tour:t-1", "max");
    expect(notifyBooking).toHaveBeenCalledWith("b-1");
  });

  it("answers 97 for a bad signature, another merchant or missing keys, and records nothing", async () => {
    // Sampled at 10 % (public, repeatable requests): make this one land.
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    expect(await handleVnpayIpn({ ...ipn(), vnp_Amount: "1" })).toMatchObject({ RspCode: "97" });
    expect(await handleVnpayIpn(ipn({ vnp_TmnCode: "OTHER001" }))).toMatchObject({ RspCode: "97" });
    configState.vnpay = null;
    expect(await handleVnpayIpn(ipn())).toMatchObject({ RspCode: "97" });
    expect(repo.recordPaymentEvent).not.toHaveBeenCalled();
    // Each problem reaches Sentry with the payments tag, and nothing from the request.
    expect(captureMessage).toHaveBeenCalledWith("payment.vnpay_bad_signature", {
      level: "warning",
      tags: { "payment.webhook": "vnpay", "payment.event": "payment.vnpay_bad_signature" },
      fingerprint: ["payment", "payment.vnpay_bad_signature", "vnpay"],
    });
    expect(captureMessage).toHaveBeenCalledWith("payment.vnpay_ipn_unconfigured", expect.objectContaining({ tags: expect.objectContaining({ "payment.webhook": "vnpay" }) }));
    expect(JSON.stringify(captureMessage.mock.calls)).not.toMatch(/PTA|vnp_|1290000000/);
    // The other 90 % are logged only.
    captureMessage.mockClear();
    vi.mocked(Math.random).mockReturnValue(0.5);
    expect(await handleVnpayIpn({ ...ipn(), vnp_Amount: "1" })).toMatchObject({ RspCode: "97" });
    expect(captureMessage).not.toHaveBeenCalledWith("payment.vnpay_bad_signature", expect.anything());
    expect(logger.error).toHaveBeenCalledWith("payment.vnpay_bad_signature", expect.anything());
    vi.mocked(Math.random).mockRestore();
  });

  it("answers 01 for an unknown order", async () => {
    repo.findPaymentByReference.mockResolvedValueOnce({ data: null, error: null });
    repo.recordPaymentEvent.mockResolvedValueOnce({ data: { result: "unmatched" }, error: null });
    expect(await handleVnpayIpn(ipn())).toEqual({ RspCode: "01", Message: "Order not found" });
  });

  it("records a signed amount mismatch with the amount received and answers 04", async () => {
    repo.recordPaymentEvent.mockResolvedValueOnce({
      data: { result: "recorded", booking_id: "b-1", status: "pending_payment", needs_attention: true, attention_reason: "underpaid" },
      error: null,
    });
    expect(await handleVnpayIpn(ipn({ vnp_Amount: "100000000" }))).toEqual({ RspCode: "04", Message: "Invalid amount" });
    expect(repo.recordPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({ amount: 1_000_000, succeeded: true }));
    expect(logger.error).toHaveBeenCalledWith("payment.needs_attention", expect.objectContaining({ reason: "underpaid" }));
  });

  it("answers 02 for a repeat and for money on an attempt that is no longer pending", async () => {
    repo.recordPaymentEvent.mockResolvedValueOnce({ data: { result: "duplicate" }, error: null });
    expect(await handleVnpayIpn(ipn())).toEqual({ RspCode: "02", Message: "Order already confirmed" });
    // A replayed IPN sends no email.
    expect(notifyBooking).not.toHaveBeenCalled();
    repo.findPaymentByReference.mockResolvedValueOnce({ data: { ...payment, status: "cancelled" }, error: null });
    repo.recordPaymentEvent.mockResolvedValueOnce({
      data: { result: "recorded", status: "pending_payment", needs_attention: true, attention_reason: "paid_after_switch" },
      error: null,
    });
    expect(await handleVnpayIpn(ipn({ vnp_TransactionNo: "999" }))).toEqual({ RspCode: "02", Message: "Order already confirmed" });
  });

  it("records a verified failure as failed and acknowledges it", async () => {
    repo.recordPaymentEvent.mockResolvedValueOnce({ data: { result: "failed", booking_id: "b-1" }, error: null });
    expect(await handleVnpayIpn(ipn({ vnp_ResponseCode: "24", vnp_TransactionStatus: "02" }))).toEqual({ RspCode: "00", Message: "Confirm Success" });
    expect(repo.recordPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({ succeeded: false }));
    // A success code with the other code failed is still a failure.
    await handleVnpayIpn(ipn({ vnp_TransactionStatus: "02" }));
    expect(repo.recordPaymentEvent).toHaveBeenLastCalledWith(expect.objectContaining({ succeeded: false }));
  });
});

describe("VNPay IPN source allow-list (Phase 6 decision 2)", () => {
  it("passes every source while the list is off, as before", async () => {
    expect(await receiveVnpayIpn(ipn(), from("192.0.2.1"))).toEqual({ status: 200, body: { RspCode: "00", Message: "Confirm Success" } });
    configState.allowList = { mode: "unrestricted" };
    expect((await receiveVnpayIpn(ipn(), new Headers())).status).toBe(200);
  });

  it("refuses an address outside the list with 403 and records nothing; unsigned noise is logged only", async () => {
    configState.allowList = PROVIDER_RANGE;
    expect(await receiveVnpayIpn({ ...ipn(), vnp_Amount: "1" }, from("192.0.2.1"))).toEqual({ status: 403, body: { RspCode: "99", Message: "Unknown error" } });
    expect(await receiveVnpayIpn(null, new Headers())).toMatchObject({ status: 403 });
    // A spoofed second hop does not help: only the first x-forwarded-for hop counts.
    expect(await receiveVnpayIpn({ ...ipn(), vnp_Amount: "1" }, from("192.0.2.1, 203.0.113.9"))).toMatchObject({ status: 403 });
    expect(repo.recordPaymentEvent).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("payment.webhook_source_refused", { provider: "vnpay", signed: false });
    expect(captureMessage).not.toHaveBeenCalledWith("payment.webhook_source_refused", expect.anything());
  });

  it("reports a correctly signed IPN from an unlisted address as one error per window, however often it is replayed", async () => {
    configState.allowList = PROVIDER_RANGE;
    // A signed set is not secret (VNPay signs the return URL with it): replays must not drain Sentry.
    for (let i = 0; i < 25; i++) expect((await receiveVnpayIpn(ipn(), from("192.0.2.1"))).status).toBe(403);
    expect(repo.recordPaymentEvent).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith("payment.webhook_source_refused", {
      level: "error",
      tags: { "payment.webhook": "vnpay", "payment.event": "payment.webhook_source_refused" },
      fingerprint: ["payment", "payment.webhook_source_refused", "vnpay"],
    });
    // Every call is still logged.
    expect(logger.warn).toHaveBeenCalledTimes(25);
    expect(redis.keys).toEqual(new Set(["webhook_source_refused:vnpay"]));
  });

  it("falls back to a 10 % sampled warning without Upstash", async () => {
    configState.allowList = PROVIDER_RANGE;
    for (const mode of ["unconfigured", "down"] as const) {
      redis.mode = mode;
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      await receiveVnpayIpn(ipn(), from("192.0.2.1"));
      expect(captureMessage).not.toHaveBeenCalled();
      vi.mocked(Math.random).mockReturnValue(0.05);
      await receiveVnpayIpn(ipn(), from("192.0.2.1"));
      expect(captureMessage).toHaveBeenCalledWith("payment.webhook_source_refused", expect.objectContaining({ level: "warning" }));
      vi.mocked(Math.random).mockRestore();
      captureMessage.mockClear();
    }
  });

  it("does not alert for an IPN signed for another merchant code", async () => {
    configState.allowList = PROVIDER_RANGE;
    expect((await receiveVnpayIpn(ipn({ vnp_TmnCode: "OTHER001" }), from("192.0.2.1"))).status).toBe(403);
    expect(captureMessage).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("payment.webhook_source_refused", { provider: "vnpay", signed: false });
  });

  it("handles a listed address (IPv4 or IPv6), and a bad signature from it is an unsampled error", async () => {
    configState.allowList = PROVIDER_RANGE;
    expect(await receiveVnpayIpn(ipn(), from("203.0.113.9"))).toEqual({ status: 200, body: { RspCode: "00", Message: "Confirm Success" } });
    expect(repo.recordPaymentEvent).toHaveBeenCalledTimes(1);
    expect((await receiveVnpayIpn(ipn(), from("2001:db8::7"))).status).toBe(200);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(await receiveVnpayIpn({ ...ipn(), vnp_Amount: "1" }, from("203.0.113.9"))).toEqual({ status: 200, body: { RspCode: "97", Message: "Invalid Checksum" } });
    vi.mocked(Math.random).mockRestore();
    expect(captureMessage).toHaveBeenCalledWith("payment.vnpay_bad_signature", expect.objectContaining({ level: "error" }));
    expect(await receiveVnpayIpn(null, from("203.0.113.9"))).toEqual({ status: 200, body: { RspCode: "97", Message: "Invalid Checksum" } });
  });
});

describe("bank webhook", () => {
  const credit = { id: 7, transferType: "in", transferAmount: 3_000_000, content: "PTA2611004201" };
  const auth = new Headers({ Authorization: "Apikey a-long-bank-webhook-secret" });

  it("answers 503 without settings and 401 without the key, recording nothing", async () => {
    configState.bank = null;
    expect(await handleBankWebhook(auth, credit)).toEqual({ status: 503, body: { success: false } });
    configState.bank = { provider: "sepay", secret: "a-long-bank-webhook-secret" };
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    expect(await handleBankWebhook(new Headers(), credit)).toEqual({ status: 401, body: { success: false } });
    vi.mocked(Math.random).mockRestore();
    expect(repo.recordPaymentEvent).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith("payment.bank_webhook_unauthorized", expect.objectContaining({ level: "warning", tags: { "payment.webhook": "sepay", "payment.event": "payment.bank_webhook_unauthorized" } }));
  });

  it("refuses a source outside the allow-list before the key (403); a valid key from there is an error", async () => {
    configState.allowList = PROVIDER_RANGE;
    expect(await handleBankWebhook(from("192.0.2.1"), credit)).toEqual({ status: 403, body: { success: false } });
    expect(logger.warn).toHaveBeenCalledWith("payment.webhook_source_refused", { provider: "sepay", signed: false });
    expect(captureMessage).not.toHaveBeenCalled();
    for (let i = 0; i < 3; i++) {
      expect(await handleBankWebhook(from("192.0.2.1", { Authorization: "Apikey a-long-bank-webhook-secret" }), credit)).toEqual({ status: 403, body: { success: false } });
    }
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith("payment.webhook_source_refused", expect.objectContaining({ level: "error", tags: expect.objectContaining({ "payment.webhook": "sepay" }) }));
    expect(repo.recordPaymentEvent).not.toHaveBeenCalled();
  });

  it("the route's gate refuses the source before the body is read", async () => {
    configState.allowList = PROVIDER_RANGE;
    expect(await bankWebhookGate(from("192.0.2.1"))).toEqual({ status: 403, body: { success: false } });
    expect(await bankWebhookGate(from("203.0.113.20"))).toBeNull();
    configState.bank = null;
    expect(await bankWebhookGate(from("203.0.113.20"))).toEqual({ status: 503, body: { success: false } });
  });

  it("records from a listed address; a wrong key from there is an unsampled error", async () => {
    configState.allowList = PROVIDER_RANGE;
    expect(await handleBankWebhook(from("203.0.113.20", { Authorization: "Apikey a-long-bank-webhook-secret" }), credit)).toEqual({ status: 200, body: { success: true } });
    expect(repo.recordPaymentEvent).toHaveBeenCalledTimes(1);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(await handleBankWebhook(from("203.0.113.20", { Authorization: "Apikey wrong" }), credit)).toEqual({ status: 401, body: { success: false } });
    vi.mocked(Math.random).mockRestore();
    expect(captureMessage).toHaveBeenCalledWith("payment.bank_webhook_unauthorized", expect.objectContaining({ level: "error" }));
  });

  it("records an incoming credit as a bank-transfer event", async () => {
    expect(await handleBankWebhook(auth, credit)).toEqual({ status: 200, body: { success: true } });
    expect(repo.recordPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "bank_transfer", reference: "PTA2611004201", amount: 3_000_000, eventKey: "sepay:7", succeeded: true }),
    );
  });

  it("acknowledges an outgoing transfer without recording it", async () => {
    expect(await handleBankWebhook(auth, { ...credit, transferType: "out" })).toEqual({ status: 200, body: { success: true } });
    expect(repo.recordPaymentEvent).not.toHaveBeenCalled();
  });

  it("asks the provider to retry when recording fails", async () => {
    repo.recordPaymentEvent.mockResolvedValueOnce({ data: null, error: { code: "08006", message: "connection" } });
    expect(await handleBankWebhook(auth, credit)).toEqual({ status: 500, body: { success: false } });
  });
});

describe("available methods", () => {
  it("offers VNPay with keys and transfers only with a complete account", async () => {
    expect(await availableMethods()).toEqual(["vnpay"]);
    repo.bankAccountSetting.mockResolvedValueOnce({ data: { value: { bank_bin: "970436", account_number: "0011", account_holder: "A" } }, error: null });
    configState.vnpay = null;
    expect(await availableMethods()).toEqual(["bank_transfer"]);
  });

  it("throws when the bank account setting cannot be read (no long-cached 'no account')", async () => {
    repo.bankAccountSetting.mockResolvedValueOnce({ data: null, error: { code: "57014", message: "timeout" } } as never);
    await expect(availableMethods()).rejects.toThrow(/bank account setting read failed/);
  });
});
