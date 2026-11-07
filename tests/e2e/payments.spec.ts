import { expect, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { booking, closeTestDepartures, heldBooking, pay, testDeparture, vnpaySign } from "./support/booking";

// Phase 4 PR 4C: the VNPay IPN, the CI stub and the bank-transfer webhook against the running app
// and the local database. CI sets VNPAY_TMN_CODE/_HASH_SECRET, VNPAY_STUB and
// BANK_WEBHOOK_PROVIDER/_SECRET to CI-only values.

const TMN = process.env.VNPAY_TMN_CODE ?? "";
const SECRET = process.env.VNPAY_HASH_SECRET ?? "";
const BANK_SECRET = process.env.BANK_WEBHOOK_SECRET ?? "";

test.skip(!TMN || !SECRET || !BANK_SECRET || !process.env.E2E_SUPABASE_SECRET_KEY, "needs the CI payment settings");
test.describe.configure({ mode: "serial" });
test.afterAll(closeTestDepartures);

let txn = Math.floor(Math.random() * 1_000_000) * 100;
function ipn(reference: string, amount: number, patch: Record<string, string> = {}) {
  txn += 1;
  const params: Record<string, string> = {
    vnp_Amount: String(amount * 100),
    vnp_BankCode: "NCB",
    vnp_OrderInfo: "Thanh toan",
    vnp_ResponseCode: "00",
    vnp_TmnCode: TMN,
    vnp_TransactionNo: String(txn),
    vnp_TransactionStatus: "00",
    vnp_TxnRef: reference,
    ...patch,
  };
  return { ...params, vnp_SecureHash: vnpaySign(params, SECRET) };
}

const ipnUrl = (params: Record<string, string>) => `/api/payments/vnpay/ipn?${new URLSearchParams(params)}`;

test("VNPay IPN: signature, merchant, order, amount and repeats", async ({ request }) => {
  const departure = await testDeparture(10);
  const paid = await heldBooking(departure, "vnpay");

  const bad = { ...ipn(paid.reference, paid.amount), vnp_SecureHash: "00" };
  expect(await (await request.get(ipnUrl(bad))).json()).toEqual({ RspCode: "97", Message: "Invalid Checksum" });
  expect(await (await request.get(ipnUrl(ipn(paid.reference, paid.amount, { vnp_TmnCode: "OTHERTMN" })))).json()).toMatchObject({ RspCode: "97" });
  expect((await booking(paid.bookingId)).status).toBe("pending_payment");

  const good = ipn(paid.reference, paid.amount);
  expect(await (await request.get(ipnUrl(good))).json()).toEqual({ RspCode: "00", Message: "Confirm Success" });
  expect(await booking(paid.bookingId)).toMatchObject({ status: "confirmed", payment_state: "paid", amount_paid: paid.amount });
  expect(await (await request.get(ipnUrl(good))).json()).toEqual({ RspCode: "02", Message: "Order already confirmed" });

  expect(await (await request.get(ipnUrl(ipn("PTA999999999901", 1000)))).json()).toEqual({ RspCode: "01", Message: "Order not found" });

  // A signed amount that differs: recorded with the amount received, flagged, answered 04.
  const short = await heldBooking(departure, "vnpay");
  expect(await (await request.get(ipnUrl(ipn(short.reference, short.amount - 1_000_000)))).json()).toEqual({
    RspCode: "04",
    Message: "Invalid amount",
  });
  expect(await booking(short.bookingId)).toMatchObject({ status: "pending_payment", needs_attention: true, attention_reason: "underpaid" });

  // A verified failure: the payment fails, the hold stays.
  const failed = await heldBooking(departure, "vnpay");
  expect(await (await request.get(ipnUrl(ipn(failed.reference, failed.amount, { vnp_ResponseCode: "24", vnp_TransactionStatus: "02" })))).json()).toMatchObject({
    RspCode: "00",
  });
  expect((await booking(failed.bookingId)).status).toBe("pending_payment");
  const { data: attempt } = await adminApi().from("payments").select("status").eq("reference", failed.reference).single();
  expect(attempt?.status).toBe("failed");

  // The old VNPay attempt paid after switching to a transfer: recorded and flagged, answered 02.
  const switched = await heldBooking(departure, "vnpay");
  await pay(switched.bookingId, "bank_transfer");
  expect(await (await request.get(ipnUrl(ipn(switched.reference, switched.amount)))).json()).toMatchObject({ RspCode: "02" });
  expect(await booking(switched.bookingId)).toMatchObject({ status: "confirmed", needs_attention: true, attention_reason: "paid_after_switch" });
});

test("the VNPay stub signs its IPN and the return only redirects", async ({ request }) => {
  const departure = await testDeparture(5);
  const held = await heldBooking(departure, "vnpay");
  // What the app's payment URL carries (paymentParams in vnpay.ts).
  const params: Record<string, string> = {
    vnp_Amount: String(held.amount * 100),
    vnp_Command: "pay",
    vnp_CreateDate: "20261107100000",
    vnp_CurrCode: "VND",
    vnp_IpAddr: "127.0.0.1",
    vnp_Locale: "vn",
    vnp_OrderInfo: "Thanh toan",
    vnp_OrderType: "other",
    vnp_ReturnUrl: new URL("/api/payments/vnpay/return", process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").toString(),
    vnp_TmnCode: TMN,
    vnp_TxnRef: held.reference,
    vnp_Version: "2.1.0",
  };
  const signed = new URLSearchParams({ ...params, vnp_SecureHash: vnpaySign(params, SECRET) });
  const page = await request.get(`/api/payments/vnpay/stub?${signed}`);
  expect(page.status()).toBe(200);
  expect(await page.text()).toContain(held.reference);
  // Tampered parameters are refused.
  const tampered = new URLSearchParams(signed);
  tampered.set("vnp_Amount", "100");
  expect((await request.get(`/api/payments/vnpay/stub?${tampered}`)).status()).toBe(400);

  const done = await request.post("/api/payments/vnpay/stub", {
    form: { outcome: "success", params: signed.toString() },
    maxRedirects: 0,
  });
  expect(done.status()).toBe(303);
  const back = new URL(done.headers().location);
  expect(back.pathname).toBe("/api/payments/vnpay/return");
  expect((await booking(held.bookingId)).status).toBe("confirmed");
  const result = await request.get(`${back.pathname}${back.search}`, { maxRedirects: 0 });
  expect(result.status()).toBe(303);
  const code = (await booking(held.bookingId)).code;
  expect(result.headers().location).toContain(`/thanh-toan/${code}/ket-qua`);
});

test("bank webhook: key, credits only, memo matching, under- and overpayment", async ({ request }) => {
  const departure = await testDeparture(10);
  const transfer = await heldBooking(departure, "bank_transfer");
  const post = (body: unknown, key = BANK_SECRET) =>
    request.post("/api/webhooks/bank-transfer", { data: body, headers: { Authorization: `Apikey ${key}` } });
  let id = Date.now();
  const credit = (memo: string, amount: number, type = "in") => ({
    id: (id += 1),
    gateway: "Vietcombank",
    transferType: type,
    transferAmount: amount,
    content: memo,
    referenceCode: `FT${id}`,
  });

  expect((await post(credit(transfer.reference, transfer.amount), "wrong-key-of-some-length")).status()).toBe(401);
  // An outgoing transfer quoting the reference is ignored.
  expect((await post(credit(`hoan tien ${transfer.reference}`, transfer.amount, "out"))).status()).toBe(200);
  expect((await booking(transfer.bookingId)).status).toBe("pending_payment");

  expect((await post(credit(`CK ${transfer.reference.toLowerCase()} tour`, transfer.amount))).status()).toBe(200);
  expect(await booking(transfer.bookingId)).toMatchObject({ status: "confirmed", amount_paid: transfer.amount });
  // A second transfer with the same memo: a new payment row, flagged as overpaid.
  expect((await post(credit(transfer.reference, 500_000))).status()).toBe(200);
  expect(await booking(transfer.bookingId)).toMatchObject({ amount_paid: transfer.amount + 500_000, needs_attention: true, attention_reason: "overpaid" });

  // Too little money: recorded, not confirmed.
  const short = await heldBooking(departure, "bank_transfer");
  expect((await post(credit(short.reference, short.amount - 2_000_000))).status()).toBe(200);
  expect(await booking(short.bookingId)).toMatchObject({ status: "pending_payment", attention_reason: "underpaid" });

  // A memo without a reference is kept as unmatched for the accountant.
  const unknown = credit("chuyen tien tour", 1_000_000);
  expect((await post(unknown)).status()).toBe(200);
  const { data: event } = await adminApi().from("webhook_events").select("error").eq("event_key", `sepay:${unknown.id}`).single();
  expect(event?.error).toBe("unmatched");
});
