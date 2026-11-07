import "server-only";

import * as Sentry from "@sentry/nextjs";
import { revalidateTag } from "next/cache";

import { checkSource, type SourceCheck } from "@/lib/ip-allowlist";
import { logger } from "@/lib/logger";
import { notifyBooking } from "@/modules/booking/booking-emails.service";
import { TOURS_TAG, tourTag } from "@/modules/catalog/cache-tags";
import type { Json } from "@/types/database.types";

import { bankWebhookConfig, vnpayConfig, webhookAllowList } from "./payment.config";
import * as repo from "./payment.repository";
import type { GatewayEvent, PaymentInstructions, PaymentToStart } from "./provider";
import { authorized, parseBankWebhook } from "./providers/bank-webhook";
import { type BankAccount, vietQrProvider } from "./providers/vietqr";
import { checkIpn, verifySignature, vnpayProvider } from "./providers/vnpay";

/** What record_payment_event() returns (decision 4). */
export type RecordResult = {
  result: "duplicate" | "unmatched" | "failed" | "recorded";
  booking_id?: string;
  status?: string;
  needs_attention?: boolean;
  attention_reason?: string | null;
};

type Provider = "vnpay" | "bank_transfer";

/**
 * An IPN or webhook problem: logged, and sent to Sentry with the tag `payment.webhook` (the
 * provider) and `payment.event`, for the payments alert rule (docs/specs/phase-6-hardening-launch.md
 * decision 3). Sentry gets the event name and tags only, never references, amounts, addresses or
 * payloads.
 *
 * Quota (decision 2, revisited in PR 6A now that the source allow-lists exist):
 * - A request from outside an enforced allow-list is logged only, never sent to Sentry, unless its
 *   signature or key is valid: then the real provider called from an address the list lacks
 *   (payments would stop being confirmed), an error every time.
 * - A bad signature or key from inside an enforced allow-list can only come from the provider's own
 *   addresses (a wrong secret, a changed format): an error every time.
 * - Without an enforced list (empty, or the `unrestricted` exception) anyone can send them again
 *   and again, so they stay warnings sampled at 10 %.
 */
type ProblemOptions = { level?: "error" | "warning"; sampleRate?: number };
const PUBLIC_PROBLEM: ProblemOptions = { level: "warning", sampleRate: 0.1 };

/** How loudly a bad signature or key is reported, by where the request came from. */
function badCredentialsProblem(source: SourceCheck): ProblemOptions {
  return source.enforced ? { level: "error" } : PUBLIC_PROBLEM;
}

function reportPaymentProblem(
  event: string,
  provider: Provider | "sepay" | "casso",
  fields: Record<string, string | number | boolean | null | undefined>,
  { level = "error", sampleRate = 1 }: ProblemOptions = {},
) {
  logger.error(event, { provider, ...fields });
  if (sampleRate < 1 && Math.random() >= sampleRate) return;
  Sentry.captureMessage(event, { level, tags: { "payment.webhook": provider, "payment.event": event }, fingerprint: ["payment", event, provider] });
}

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
    reportPaymentProblem("payment.record_failed", provider, { code: error?.code, message: error?.message });
    return null;
  }
  const result = data as unknown as RecordResult;
  if (result.needs_attention) {
    // Monitored (ARCHITECTURE.md "Monitoring"); never the payload or card data.
    reportPaymentProblem("payment.needs_attention", provider, { reference: event.reference, reason: result.attention_reason }, { level: "warning" });
  }
  // After the commit: payment received, booking confirmed and staff alerts, each once (4E). A
  // duplicate event returns "duplicate" and sends nothing.
  if (result.result === "recorded") notifyBooking(result.booking_id);
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
export async function handleVnpayIpn(
  params: Record<string, string>,
  source: SourceCheck = { enforced: false, allowed: true },
): Promise<IpnResponse> {
  const config = vnpayConfig();
  if (!config) {
    reportPaymentProblem("payment.vnpay_ipn_unconfigured", "vnpay", {});
    return { RspCode: "97", Message: "Invalid Checksum" };
  }
  const check = checkIpn(config, params);
  if (!check.ok) {
    reportPaymentProblem("payment.vnpay_bad_signature", "vnpay", { reference: params.vnp_TxnRef ?? null }, badCredentialsProblem(source));
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

export type IpnReply = { status: 200 | 403; body: IpnResponse };

/**
 * The IPN route's entry point: the source allow-list first (decision 2), then handleVnpayIpn().
 * A refused source gets 403 and nothing is read or recorded; VNPay retries a non-success answer,
 * so a payment sent from an address the list lacks is confirmed once the list is fixed.
 */
export async function receiveVnpayIpn(params: Record<string, string> | null, headers: Headers): Promise<IpnReply> {
  const source = checkSource(webhookAllowList("vnpay"), headers);
  if (!source.allowed) {
    const config = vnpayConfig();
    const signed = Boolean(config && params?.vnp_SecureHash && verifySignature(params, config.hashSecret));
    sourceRefused("vnpay", signed);
    return { status: 403, body: { RspCode: "99", Message: "Unknown error" } };
  }
  if (!params) return { status: 200, body: { RspCode: "97", Message: "Invalid Checksum" } };
  return { status: 200, body: await handleVnpayIpn(params, source) };
}

/** A webhook call from outside the allow-list: noise, unless it carries valid credentials. */
function sourceRefused(provider: "vnpay" | "sepay" | "casso", signed: boolean) {
  if (signed) {
    reportPaymentProblem("payment.webhook_source_refused", provider, { signed: true });
  } else {
    logger.warn("payment.webhook_source_refused", { provider, signed: false });
  }
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

/**
 * The receiving account from settings.bank_account, or null while it is incomplete (method hidden).
 * A failed read throws, so cached callers (`onlineBookingAvailable()`) keep their short error
 * profile instead of caching "no bank account" for hours.
 */
export async function bankAccount(): Promise<BankAccount | null> {
  const { data, error } = await repo.bankAccountSetting();
  if (error) throw new Error(`bank account setting read failed: ${error.code ?? "unknown"}`);
  const value = (data?.value ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string) : "");
  const account = { bankBin: text("bank_bin"), bankName: text("bank_name"), accountNumber: text("account_number"), accountHolder: text("account_holder") };
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

export type WebhookReply = { status: 200 | 400 | 401 | 403 | 500 | 503; body: { success: boolean } };

/**
 * SePay/Casso webhook (decision 6): the source allow-list, the API key, then incoming credits only, each recorded
 * through record_payment_event() with the reference found in the memo (none → unmatched, kept for
 * the accountant). Under- and overpayment, late and repeated transfers are handled there.
 */
export async function handleBankWebhook(headers: Headers, body: unknown): Promise<WebhookReply> {
  const config = bankWebhookConfig();
  if (!config) return { status: 503, body: { success: false } };
  // The source allow-list first (decision 2): a refused call is never parsed or recorded.
  const source = checkSource(webhookAllowList("bank"), headers);
  if (!source.allowed) {
    sourceRefused(config.provider, authorized(config.provider, headers, config.secret));
    return { status: 403, body: { success: false } };
  }
  if (!authorized(config.provider, headers, config.secret)) {
    reportPaymentProblem("payment.bank_webhook_unauthorized", config.provider, {}, badCredentialsProblem(source));
    return { status: 401, body: { success: false } };
  }
  const parsed = parseBankWebhook(config.provider, body);
  if (!parsed) return { status: 400, body: { success: false } };
  if (parsed.ignored > 0) logger.info("payment.bank_webhook_ignored", { provider: config.provider, count: parsed.ignored });
  for (const event of parsed.events) {
    const result = await recordEvent("bank_transfer", event);
    // The provider retries on a non-2xx answer; events already recorded come back as duplicates.
    if (!result) return { status: 500, body: { success: false } };
    if (result.result === "unmatched") reportPaymentProblem("payment.bank_transfer_unmatched", "bank_transfer", { eventKey: event.eventKey }, { level: "warning" });
    if (result.result === "recorded" && result.booking_id) await refreshBooking(result.booking_id);
  }
  return { status: 200, body: { success: true } };
}

async function refreshBooking(bookingId: string) {
  const { data } = await repo.bookingTour(bookingId);
  refreshTour(data?.tour_id);
}
