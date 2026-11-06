import "server-only";

import { revalidateTag } from "next/cache";

import { logger } from "@/lib/logger";
import { TOURS_TAG, tourTag } from "@/modules/catalog/cache-tags";
import type { Json } from "@/types/database.types";

import { vnpayConfig } from "./payment.config";
import * as repo from "./payment.repository";
import type { GatewayEvent, PaymentInstructions, PaymentToStart } from "./provider";
import { type BankAccount, vietQrProvider } from "./providers/vietqr";
import { checkIpn, vnpayProvider } from "./providers/vnpay";

/** What record_payment_event() returns (decision 4). */
export type RecordResult = {
  result: "duplicate" | "unmatched" | "failed" | "recorded";
  booking_id?: string;
  status?: string;
  needs_attention?: boolean;
  attention_reason?: string | null;
};

type Provider = "vnpay" | "bank_transfer";

/** Records a verified gateway event; refreshes the tour's cached pages when money moved. */
export async function recordEvent(provider: Provider, event: GatewayEvent): Promise<RecordResult | null> {
  const { data, error } = await repo.recordPaymentEvent({
    provider,
    eventKey: event.eventKey,
    payload: event.payload as Json,
    reference: event.reference,
    amount: event.amount,
    providerTxnId: event.providerTxnId,
    succeeded: event.succeeded,
  });
  if (error || !data) {
    logger.error("payment.record_failed", { provider, code: error?.code, message: error?.message });
    return null;
  }
  const result = data as unknown as RecordResult;
  if (result.needs_attention) {
    // Monitored (ARCHITECTURE.md "Monitoring"); never the payload or card data.
    logger.error("payment.needs_attention", { provider, reference: event.reference, reason: result.attention_reason });
  }
  return result;
}

function refreshTour(tourId: string | undefined) {
  if (!tourId) return;
  // A late payment can take seats again (decision 11).
  revalidateTag(TOURS_TAG, "max");
  revalidateTag(tourTag(tourId), "max");
}

export type IpnResponse = { RspCode: "00" | "01" | "02" | "04" | "97" | "99"; Message: string };

/**
 * VNPay IPN (decision 6): signature and merchant (97), the order (01), already confirmed (02), the
 * amount (04: recorded and flagged, confirmed only if the deposit is covered), then 00. Every
 * result goes through record_payment_event(); the return URL never confirms.
 */
export async function handleVnpayIpn(params: Record<string, string>): Promise<IpnResponse> {
  const config = vnpayConfig();
  if (!config) {
    logger.error("payment.vnpay_ipn_unconfigured", {});
    return { RspCode: "97", Message: "Invalid Checksum" };
  }
  const check = checkIpn(config, params);
  if (!check.ok) {
    logger.error("payment.vnpay_bad_signature", { reference: params.vnp_TxnRef ?? null });
    return { RspCode: check.rspCode, Message: check.message };
  }
  const { data: payment } = await repo.findPaymentByReference(check.event.reference, "vnpay");
  if (!payment) {
    await recordEvent("vnpay", check.event);
    return { RspCode: "01", Message: "Order not found" };
  }
  const wasPending = payment.status === "pending";
  const amountMismatch = check.event.succeeded && check.reportedAmount !== payment.amount;
  const event = check.event.succeeded && check.reportedAmount === 0 ? { ...check.event, succeeded: false } : check.event;
  const result = await recordEvent("vnpay", event);
  if (!result) return { RspCode: "99", Message: "Unknown error" };
  if (result.result === "duplicate") return { RspCode: "02", Message: "Order already confirmed" };
  if (result.result === "unmatched") return { RspCode: "01", Message: "Order not found" };
  if (result.result === "recorded") refreshTour(payment.bookings?.tour_id);
  if (amountMismatch) return { RspCode: "04", Message: "Invalid amount" };
  if (!wasPending && event.succeeded) return { RspCode: "02", Message: "Order already confirmed" };
  return { RspCode: "00", Message: "Confirm Success" };
}

/** Where the browser goes after VNPay: the checkout result page, which only displays (decision 6). */
export async function vnpayReturnTarget(query: URLSearchParams): Promise<{ code: string; locale: "vi" | "en" } | null> {
  const config = vnpayConfig();
  if (!config) return null;
  const verified = vnpayProvider(config).verifyReturn?.(query);
  if (!verified?.valid || !verified.reference) return null;
  const { data: payment } = await repo.findPaymentByReference(verified.reference, "vnpay");
  if (!payment?.bookings) return null;
  return { code: payment.bookings.code, locale: payment.bookings.locale };
}

/** The receiving account from settings.bank_account, or null while it is incomplete (method hidden). */
export async function bankAccount(): Promise<BankAccount | null> {
  const { data } = await repo.bankAccountSetting();
  const value = (data?.value ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string) : "");
  const account = { bankBin: text("bank_bin"), accountNumber: text("account_number"), accountHolder: text("account_holder") };
  return /^\d{6}$/.test(account.bankBin) && account.accountNumber && account.accountHolder ? account : null;
}

/** Methods the checkout may offer: only those whose credentials or account exist (decision 6). */
export async function availableMethods(): Promise<("vnpay" | "bank_transfer")[]> {
  const methods: ("vnpay" | "bank_transfer")[] = [];
  if (vnpayConfig()) methods.push("vnpay");
  if (await bankAccount()) methods.push("bank_transfer");
  return methods;
}

/** What the customer does next for a payment started by reserve_and_create_payment(). */
export async function instructionsFor(provider: "vnpay" | "bank_transfer", payment: PaymentToStart): Promise<PaymentInstructions | null> {
  if (provider === "vnpay") {
    const config = vnpayConfig();
    return config ? vnpayProvider(config).createPayment(payment) : null;
  }
  const account = await bankAccount();
  return account ? vietQrProvider(account).createPayment(payment) : null;
}
