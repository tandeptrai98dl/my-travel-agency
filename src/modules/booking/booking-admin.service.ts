import "server-only";

import { z } from "zod";

import { pageRange, type ListParams } from "@/lib/admin/list-params";
import { todayInVietnam } from "@/lib/dates";
import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import type { Json } from "@/types/database.types";

import * as repo from "./booking-admin.repository";
import {
  attentionReason,
  type AttentionItem,
  bookingErrorCode,
  type BookingActionResult,
  type BookingDetail,
  type BookingListRow,
  type BookingNoteValues,
  type BookingSort,
  BOOKING_STATUSES,
  type UpdateContactValues,
} from "./booking-admin.schemas";
import { refreshTour } from "./booking.service";

type One<T> = T | T[] | null;
const one = <T>(value: One<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);
const personLabel = (person: { full_name: string | null; email: string } | null) =>
  person ? (person.full_name ?? person.email) : null;

function snapshotTitle(snapshot: Json): string {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && typeof snapshot.title === "string") {
    return snapshot.title;
  }
  return "";
}

export type BookingPage = { rows: BookingListRow[]; total: number; pageCount: number };

/** One page of bookings for staff who may read them (sales, operator, accountant, admin). */
export async function listBookings(params: ListParams<BookingSort>): Promise<BookingPage> {
  await requirePermission("bookings.read");
  const uuid = (value: string | undefined) => (z.guid().safeParse(value).success ? value : undefined);
  const status = (BOOKING_STATUSES as readonly string[]).includes(params.filters.status ?? "")
    ? (params.filters.status as (typeof BOOKING_STATUSES)[number])
    : undefined;
  const query = {
    q: params.q || undefined,
    status,
    tourId: uuid(params.filters.tour),
    departureId: uuid(params.filters.departure),
    ownerId: uuid(params.filters.owner),
    attention: params.filters.attention === "1",
    sort: params.sort,
    dir: params.dir,
  };
  let { data, error, count } = await repo.findBookings({ ...query, range: pageRange(params) });
  if (error?.code === "PGRST103") {
    ({ data, error, count } = await repo.findBookings({ ...query, range: [0, 0] }));
    data = [];
  }
  if (error) throw new Error(`bookings query failed: ${error.message}`);
  const rows: BookingListRow[] = (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status,
    paymentState: row.payment_state,
    startDate: row.start_date,
    tourCode: one(row.tour)?.code ?? "",
    tourTitle: snapshotTitle(row.tour_snapshot),
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    travellers: row.adults + row.children,
    total: row.total,
    amountPaid: row.amount_paid,
    needsAttention: row.needs_attention,
    owner: personLabel(one(row.owner)),
    createdAt: row.created_at,
  }));
  const total = count ?? rows.length;
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / params.pageSize)) };
}

type AttentionRow = {
  id: string;
  code: string;
  status: AttentionItem["status"];
  payment_state: AttentionItem["paymentState"];
  start_date: string;
  contact_name: string;
  total: number;
  amount_paid: number;
  balance_due_date: string | null;
  attention_reason: string | null;
  updated_at: string;
  tour: One<{ code: string }>;
};

function toItem(row: AttentionRow, reason: AttentionItem["reason"], resolvable: boolean, since: string): AttentionItem {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    paymentState: row.payment_state,
    reason,
    resolvable,
    startDate: row.start_date,
    tourCode: one(row.tour)?.code ?? "",
    contactName: row.contact_name,
    total: row.total,
    amountPaid: row.amount_paid,
    balanceDueDate: row.balance_due_date,
    since,
  };
}

/**
 * The "needs attention" queue (spec Phase 4 step 18): bookings the payment functions or a
 * cancellation request flagged, then confirmed bookings with an overdue balance and open bookings
 * on a cancelled departure. A booking appears once, under its first reason.
 */
export async function attentionQueue(): Promise<AttentionItem[]> {
  await requirePermission("bookings.read");
  const [flagged, overdue, cancelled] = await Promise.all([
    repo.findFlaggedBookings(),
    repo.findOverdueBalances(todayInVietnam()),
    repo.findOnCancelledDepartures(),
  ]);
  const failed = flagged.error ?? overdue.error ?? cancelled.error;
  if (failed) throw new Error(`attention queue query failed: ${failed.message}`);

  const items: AttentionItem[] = [];
  const seen = new Set<string>();
  const add = (item: AttentionItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };
  for (const row of flagged.data ?? []) add(toItem(row, attentionReason(row.attention_reason), true, row.updated_at));
  for (const row of overdue.data ?? []) add(toItem(row, "balance_overdue", false, row.balance_due_date ?? row.updated_at));
  for (const row of cancelled.data ?? []) add(toItem(row, "departure_cancelled", false, row.updated_at));
  return items;
}

/** Number of flagged bookings for the dashboard (null when the role cannot read bookings). */
export async function attentionCount(): Promise<number> {
  await requirePermission("bookings.read");
  const { count, error } = await repo.countFlagged();
  if (error) throw new Error(`attention count failed: ${error.message}`);
  return count ?? 0;
}

export async function getBooking(id: string): Promise<BookingDetail | null> {
  await requirePermission("bookings.read");
  if (!z.guid().safeParse(id).success) return null;
  const { data: row, error } = await repo.findBooking(id);
  if (error) throw new Error(`booking query failed: ${error.message}`);
  if (!row) return null;
  const invoice =
    row.invoice_info && typeof row.invoice_info === "object" && !Array.isArray(row.invoice_info)
      ? Object.fromEntries(
          Object.entries(row.invoice_info).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : null;
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    status: row.status,
    paymentState: row.payment_state,
    tourId: row.tour_id,
    tourCode: one(row.tour)?.code ?? "",
    tourTitle: snapshotTitle(row.tour_snapshot),
    departureId: row.departure_id,
    departureStatus: one(row.departure)?.status ?? null,
    startDate: row.start_date,
    adults: row.adults,
    children: row.children,
    infants: row.infants,
    singleRooms: row.single_rooms,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactCountry: row.contact_country,
    specialRequests: row.special_requests,
    locale: row.locale,
    subtotal: row.subtotal,
    discountTotal: row.discount_total,
    total: row.total,
    depositAmount: row.deposit_amount,
    amountPaid: row.amount_paid,
    paymentPlan: row.payment_plan,
    balanceDueDate: row.balance_due_date,
    holdExpiresAt: row.hold_expires_at,
    needsAttention: row.needs_attention,
    attentionReason: row.needs_attention ? attentionReason(row.attention_reason) : null,
    invoiceRequested: row.invoice_requested,
    invoiceInfo: invoice,
    cancelReason: row.cancel_reason,
    owner: personLabel(one(row.owner)),
    createdAt: row.created_at,
    items: (row.items ?? []).map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      amount: item.amount,
    })),
    travellers: (row.travellers ?? []).map((traveller) => ({
      id: traveller.id,
      fullName: traveller.full_name,
      dateOfBirth: traveller.date_of_birth,
      nationality: traveller.nationality,
      isLead: traveller.is_lead,
    })),
    payments: (row.payments ?? [])
      .map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        kind: payment.kind,
        status: payment.status,
        amount: payment.amount,
        reference: payment.reference,
        paidAt: payment.paid_at,
        createdAt: payment.created_at,
        note: payment.note,
        recordedBy: personLabel(one(payment.recorder)),
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    events: (row.events ?? [])
      .map((event) => ({
        id: event.id,
        type: event.type,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        message: event.message,
        actor: personLabel(one(event.actor)),
        createdAt: event.created_at,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

function failure(action: string, error: { code?: string; message?: string }): BookingActionResult {
  const code = bookingErrorCode(error);
  if (code === "failed") logger.error("booking.admin_action_failed", { action, code: error.code });
  return { ok: false, error: code };
}

/** Operator or admin (permission `bookings.change_status`): cancels and returns the suggested refund. */
export async function cancelBooking(values: BookingNoteValues): Promise<BookingActionResult> {
  await requirePermission("bookings.change_status");
  const { data, error } = await repo.staffCancel(values.bookingId, values.note);
  if (error) return failure("cancel", error);
  const { data: booking } = await repo.bookingTourId(values.bookingId);
  if (booking) refreshTour(booking.tour_id);
  const result = (data ?? {}) as { refund_percent?: number; refund_amount?: number };
  return { ok: true, refundPercent: result.refund_percent ?? 0, refundAmount: result.refund_amount ?? 0 };
}

export async function requestCancellation(values: BookingNoteValues): Promise<BookingActionResult> {
  await requirePermission("bookings.request_cancellation");
  const { error } = await repo.requestCancellation(values.bookingId, values.note);
  return error ? failure("request_cancellation", error) : { ok: true };
}

export async function resolveAttention(values: BookingNoteValues): Promise<BookingActionResult> {
  await requirePermission("bookings.resolve_attention");
  const { error } = await repo.resolveAttention(values.bookingId, values.note);
  return error ? failure("resolve_attention", error) : { ok: true };
}

/** Contact details and special requests (column grants allow only these, `bookings.edit`). */
export async function updateContact(values: UpdateContactValues): Promise<BookingActionResult> {
  await requirePermission("bookings.edit");
  const { data, error } = await repo.updateContact(values.bookingId, {
    contact_name: values.contactName,
    contact_email: values.contactEmail,
    contact_phone: values.contactPhone,
    special_requests: values.specialRequests || null,
  });
  if (error) return failure("update_contact", error);
  return data ? { ok: true } : { ok: false, error: "not_found" };
}

/** Filter options for the bookings list. */
export async function bookingFilterOptions() {
  await requirePermission("bookings.read");
  const [owners, tours] = await Promise.all([repo.listOwners(), repo.listTours()]);
  return {
    owners: (owners.data ?? []).map((row) => ({ value: row.id, label: row.full_name ?? row.email })),
    tours: (tours.data ?? []).map((row) => ({ value: row.id, label: row.code })),
  };
}
