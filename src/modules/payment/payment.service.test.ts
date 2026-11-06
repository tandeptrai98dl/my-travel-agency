import { beforeEach, describe, expect, it, vi } from "vitest";

import { sign } from "./providers/vnpay";

vi.mock("server-only", () => ({}));
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));
const logger = { error: vi.fn(), info: vi.fn() };
vi.mock("@/lib/logger", () => ({ logger }));
const config = {
  tmnCode: "CITEST01",
  hashSecret: "ci-only-vnpay-secret-0123456789",
  paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  returnUrl: "https://example.test/api/payments/vnpay/return",
};
const configState = { vnpay: config as typeof config | null };
vi.mock("./payment.config", () => ({ vnpayConfig: () => configState.vnpay }));

type Result = { data: unknown; error: null | { code?: string; message?: string } };
const fn = (data: unknown) => vi.fn(async (...args: unknown[]): Promise<Result> => (void args, { data, error: null }));
const payment = { id: "p-1", booking_id: "b-1", amount: 12_900_000, status: "pending", kind: "full", bookings: { code: "PTA-2611-0042", locale: "vi", tour_id: "t-1" } };
const repo = {
  findPaymentByReference: fn(payment),
  recordPaymentEvent: fn({ result: "recorded", booking_id: "b-1", status: "confirmed", needs_attention: false }),
  bankAccountSetting: fn(null),
};
vi.mock("./payment.repository", () => repo);

const { handleVnpayIpn } = await import("./payment.service");

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
  repo.findPaymentByReference.mockResolvedValue({ data: payment, error: null });
  repo.recordPaymentEvent.mockResolvedValue({ data: { result: "recorded", booking_id: "b-1", status: "confirmed", needs_attention: false }, error: null });
});

describe("VNPay IPN", () => {
  it("records a valid success and answers 00", async () => {
    expect(await handleVnpayIpn(ipn())).toEqual({ RspCode: "00", Message: "Confirm Success" });
    expect(repo.recordPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "vnpay", reference: "PTA2611004201", amount: 12_900_000, succeeded: true, eventKey: "PTA2611004201:14012345:00" }),
    );
    expect(revalidateTag).toHaveBeenCalledWith("tour:t-1", "max");
  });

  it("answers 97 for a bad signature, another merchant or missing keys, and records nothing", async () => {
    expect(await handleVnpayIpn({ ...ipn(), vnp_Amount: "1" })).toMatchObject({ RspCode: "97" });
    expect(await handleVnpayIpn(ipn({ vnp_TmnCode: "OTHER001" }))).toMatchObject({ RspCode: "97" });
    configState.vnpay = null;
    expect(await handleVnpayIpn(ipn())).toMatchObject({ RspCode: "97" });
    expect(repo.recordPaymentEvent).not.toHaveBeenCalled();
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
