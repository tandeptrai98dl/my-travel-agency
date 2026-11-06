import { createHmac, timingSafeEqual } from "node:crypto";

import type { GatewayEvent, PaymentInstructions, PaymentProvider, PaymentToStart } from "../provider";

/**
 * VNPay 2.1.0 (docs/specs/phase-4-booking-payments.md decision 6). Signatures are HMAC-SHA512 over
 * the vnp_* params sorted by name, each value URL-encoded with spaces as "+" (VNPay's Node.js
 * sample). Amounts are sent × 100. Times are GMT+7, yyyyMMddHHmmss.
 */

export type VnpayConfig = { tmnCode: string; hashSecret: string; paymentUrl: string; returnUrl: string };

const encode = (value: string) => encodeURIComponent(value).replace(/%20/g, "+");

/** The canonical string VNPay signs: sorted vnp_* params except the hash fields. */
export function signData(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => key.startsWith("vnp_") && key !== "vnp_SecureHash" && key !== "vnp_SecureHashType")
    .filter((key) => params[key] !== "" && params[key] !== undefined)
    .sort()
    .map((key) => `${encode(key)}=${encode(params[key])}`)
    .join("&");
}

export function sign(params: Record<string, string>, secret: string): string {
  return createHmac("sha512", secret).update(Buffer.from(signData(params), "utf8")).digest("hex");
}

export function verifySignature(params: Record<string, string>, secret: string): boolean {
  const given = params.vnp_SecureHash ?? "";
  const expected = sign(params, secret);
  const a = Buffer.from(given.toLowerCase(), "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** yyyyMMddHHmmss in Vietnam time (GMT+7, no daylight saving). */
export function vnpayTime(date: Date): string {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    shifted.getUTCFullYear() +
    pad(shifted.getUTCMonth() + 1) +
    pad(shifted.getUTCDate()) +
    pad(shifted.getUTCHours()) +
    pad(shifted.getUTCMinutes()) +
    pad(shifted.getUTCSeconds())
  );
}

export function paymentParams(config: VnpayConfig, payment: PaymentToStart, now = new Date()): Record<string, string> {
  return {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: config.tmnCode,
    vnp_Amount: String(payment.amount * 100),
    vnp_CurrCode: "VND",
    vnp_TxnRef: payment.reference,
    // ASCII only: VNPay shows it on its page and some banks drop diacritics.
    vnp_OrderInfo: `Thanh toan ${payment.bookingCode}`,
    vnp_OrderType: "other",
    vnp_Locale: payment.locale === "vi" ? "vn" : "en",
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: payment.ipAddress || "127.0.0.1",
    vnp_CreateDate: vnpayTime(now),
    // The hold and the gateway expire together (ARCHITECTURE.md "Book-now flow" step 2).
    vnp_ExpireDate: vnpayTime(payment.expiresAt),
  };
}

export function paymentUrl(config: VnpayConfig, payment: PaymentToStart, now = new Date()): string {
  const params = paymentParams(config, payment, now);
  return `${config.paymentUrl}?${signData(params)}&vnp_SecureHash=${sign(params, config.hashSecret)}`;
}

/** VNPay counts a payment as paid only when both codes are "00" (VNPay IPN specification). */
export function isSuccess(params: Record<string, string>): boolean {
  return params.vnp_ResponseCode === "00" && params.vnp_TransactionStatus === "00";
}

export type IpnCheck =
  | { ok: false; rspCode: "97"; message: "Invalid Checksum" }
  | { ok: true; event: GatewayEvent; reportedAmount: number };

/** Signature and merchant checks of an IPN; amount and order checks need the payment (service). */
export function checkIpn(config: VnpayConfig, params: Record<string, string>): IpnCheck {
  if (!verifySignature(params, config.hashSecret) || params.vnp_TmnCode !== config.tmnCode) {
    return { ok: false, rspCode: "97", message: "Invalid Checksum" };
  }
  const raw = Number(params.vnp_Amount);
  const reportedAmount = Number.isSafeInteger(raw) && raw > 0 && raw % 100 === 0 ? raw / 100 : 0;
  const transactionNo = params.vnp_TransactionNo || null;
  return {
    ok: true,
    reportedAmount,
    event: {
      // Keyed on the gateway transaction (per reference: VNPay may send 0 for some failures), so
      // a retry is a duplicate in webhook_events, not a second payment.
      eventKey: `${params.vnp_TxnRef}:${transactionNo ?? "none"}`,
      reference: params.vnp_TxnRef ?? "",
      amount: reportedAmount,
      providerTxnId: transactionNo,
      succeeded: isSuccess(params),
      payload: Object.fromEntries(Object.entries(params).filter(([key]) => key !== "vnp_SecureHash")),
    },
  };
}

export function vnpayProvider(config: VnpayConfig): PaymentProvider & { checkIpn: typeof checkIpn } {
  return {
    id: "vnpay",
    createPayment(payment): PaymentInstructions {
      return { kind: "redirect", url: paymentUrl(config, payment) };
    },
    verifyReturn(query) {
      const params = Object.fromEntries(query.entries());
      const valid = verifySignature(params, config.hashSecret) && params.vnp_TmnCode === config.tmnCode;
      return { valid, reference: valid ? (params.vnp_TxnRef ?? null) : null, succeeded: valid && isSuccess(params) };
    },
    checkIpn,
  };
}
