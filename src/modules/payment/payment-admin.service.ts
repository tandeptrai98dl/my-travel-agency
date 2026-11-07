import "server-only";

import { pageRange, type ListParams } from "@/lib/admin/list-params";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { notifyBooking } from "@/modules/booking/booking-emails.service";
import { refreshTour } from "@/modules/booking/booking.service";

import * as repo from "./payment-admin.repository";
import {
  type AssignTransferValues,
  type LedgerRow,
  LEDGER_PROVIDERS,
  type ManualPaymentValues,
  PAYMENT_KINDS,
  type PaymentActionResult,
  paymentErrorCode,
  type PaymentSort,
  type RefundValues,
  TRANSACTION_STATUSES,
  transferFromPayload,
  type UnmatchedTransfer,
} from "./payment-admin.schemas";

type One<T> = T | T[] | null;
const one = <T>(value: One<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);
const pick = <T extends string>(allowed: readonly T[], value: string | undefined): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;

export type LedgerPage = { rows: LedgerRow[]; total: number; pageCount: number };

/** The payments ledger by gateway, status and kind (spec Phase 4 step 17). */
export async function listPayments(params: ListParams<PaymentSort>): Promise<LedgerPage> {
  await requirePermission("payments.read");
  const query = {
    q: params.q || undefined,
    provider: pick(LEDGER_PROVIDERS, params.filters.provider),
    status: pick(TRANSACTION_STATUSES, params.filters.status),
    kind: pick(PAYMENT_KINDS, params.filters.kind),
    sort: params.sort,
    dir: params.dir,
  };
  let { data, error, count } = await repo.findPayments({ ...query, range: pageRange(params) });
  if (error?.code === "PGRST103") {
    ({ data, error, count } = await repo.findPayments({ ...query, range: [0, 0] }));
    data = [];
  }
  if (error) throw new Error(`payments query failed: ${error.message}`);
  const rows: LedgerRow[] = (data ?? []).map((row) => {
    const booking = one(row.booking);
    const recorder = one(row.recorder);
    return {
      id: row.id,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      provider: row.provider,
      kind: row.kind,
      status: row.status,
      amount: row.amount,
      reference: row.reference,
      bookingId: booking?.id ?? "",
      bookingCode: booking?.code ?? "",
      note: row.note,
      recordedBy: recorder ? (recorder.full_name ?? recorder.email) : null,
    };
  });
  const total = count ?? rows.length;
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / params.pageSize)) };
}

/** Bank credits whose memo matched no payment, oldest first (accountant and admin). */
export async function listUnmatchedTransfers(): Promise<UnmatchedTransfer[]> {
  await requirePermission("payments.record");
  const { data, error } = await repo.findUnmatchedTransfers();
  if (error) throw new Error(`unmatched transfers query failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    receivedAt: row.received_at,
    eventKey: row.event_key,
    ...transferFromPayload(row.payload),
  }));
}

/** Dashboard count; 0 for roles that cannot see webhook events. */
export async function unmatchedTransferCount(role: Parameters<typeof can>[0]): Promise<number> {
  if (!can(role, "payments.record")) return 0;
  await requirePermission("payments.record");
  const { count, error } = await repo.countUnmatchedTransfers();
  if (error) throw new Error(`unmatched count failed: ${error.message}`);
  return count ?? 0;
}

function failure(action: string, error: { code?: string; message?: string }): PaymentActionResult {
  const code = paymentErrorCode(error);
  // Never the error text or the note: they can hold the customer's details.
  if (code === "failed") logger.error("payment.admin_action_failed", { action, code: error.code });
  return { ok: false, error: code };
}

async function refreshFor(bookingId: string) {
  const { data } = await repo.bookingTourId(bookingId);
  if (data) refreshTour(data.tour_id);
}

/**
 * Cash, a transfer confirmed with the bank, or money taken by phone: an MFA-verified accountant or
 * admin with a note (ADR-012). The function records it through record_payment_event(), so
 * confirmation and late-payment rules are the gateways' rules.
 */
export async function recordManualPayment(values: ManualPaymentValues): Promise<PaymentActionResult> {
  await requirePermission("payments.record");
  const { data, error } = await repo.recordManualPayment(values.bookingId, values.amount, values.method, values.note);
  if (error) return failure("manual_payment", error);
  await refreshFor(values.bookingId);
  notifyBooking(values.bookingId);
  const result = (data ?? {}) as { status?: string; reference?: string };
  return { ok: true, status: result.status, reference: result.reference };
}

export async function recordRefund(values: RefundValues): Promise<PaymentActionResult> {
  await requirePermission("payments.refund");
  const { data, error } = await repo.recordRefund(values.bookingId, values.amount, values.method, values.note);
  if (error) return failure("refund", error);
  const result = (data ?? {}) as { payment_state?: string; reference?: string };
  return { ok: true, status: result.payment_state, reference: result.reference };
}

/** Assigns an unmatched bank credit to the booking it was meant for; the amount is the webhook's. */
export async function assignTransfer(values: AssignTransferValues): Promise<PaymentActionResult> {
  await requirePermission("payments.record");
  const { data: booking, error: lookupError } = await repo.findBookingByCode(values.bookingCode);
  if (lookupError) return failure("assign_transfer", lookupError);
  if (!booking) return { ok: false, error: "not_found", fields: { bookingCode: "bookingNotFound" } };
  const { data, error } = await repo.assignUnmatchedTransfer(values.eventId, booking.id, values.note);
  if (error) return failure("assign_transfer", error);
  refreshTour(booking.tour_id);
  notifyBooking(booking.id);
  const result = (data ?? {}) as { status?: string; reference?: string };
  return { ok: true, status: result.status, reference: result.reference };
}
