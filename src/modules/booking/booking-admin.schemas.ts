import { z } from "zod";

import type { Database } from "@/types/database.types";

// Messages are keys in `Admin.Bookings.errors`.

type Enums = Database["public"]["Enums"];

export const BOOKING_STATUSES = [
  "draft",
  "quoted",
  "pending_payment",
  "confirmed",
  "completed",
  "cancelled",
  "expired",
] as const satisfies readonly Enums["booking_status"][];

export const BOOKING_SORTS = ["created_at", "start_date", "total", "code"] as const;
export type BookingSort = (typeof BOOKING_SORTS)[number];

/**
 * Why a booking is in the "needs attention" queue. The first ones are set by the payment
 * functions (spec Phase 4 decision 4) and by a cancellation request; the last two are worked out
 * from the booking itself (an overdue balance, a cancelled departure) and leave the queue when
 * the cause is dealt with.
 */
export const FLAGGED_REASONS = [
  "underpaid",
  "overpaid",
  "paid_after_switch",
  "paid_after_failure",
  "paid_after_expiry",
  "paid_after_cancel",
  "late_payment_no_seats",
  "late_payment_underpaid",
  "paid_draft",
  "paid_quoted",
  "paid_completed",
  "cancel_requested",
] as const;
export const DERIVED_REASONS = ["balance_overdue", "departure_cancelled"] as const;
export type AttentionReason = (typeof FLAGGED_REASONS)[number] | (typeof DERIVED_REASONS)[number] | "other";

export function attentionReason(value: string | null): AttentionReason {
  return (FLAGGED_REASONS as readonly string[]).includes(value ?? "") ? (value as AttentionReason) : "other";
}

/**
 * Who may clear a reason (review of PR #29), as `attention_resolvers()` in the database: a
 * cancellation request is for operators, everything else is about money and needs an
 * accountant or admin (at aal2, which requireRole() and the function check). Derived reasons are
 * never resolved by hand.
 */
export function attentionResolvers(reason: AttentionReason): readonly ("operator" | "accountant" | "admin")[] {
  if ((DERIVED_REASONS as readonly string[]).includes(reason)) return [];
  return reason === "cancel_requested" ? ["operator", "admin"] : ["accountant", "admin"];
}

export function canResolveAttention(role: string | null | undefined, reason: AttentionReason): boolean {
  return role != null && (attentionResolvers(reason) as readonly string[]).includes(role);
}

const note = z.string().trim().min(3, "noteRequired").max(500, "tooLong");

export const bookingNoteSchema = z.object({ bookingId: z.uuid(), note });
export type BookingNoteInput = z.input<typeof bookingNoteSchema>;
export type BookingNoteValues = z.output<typeof bookingNoteSchema>;

export const updateContactSchema = z.object({
  bookingId: z.uuid(),
  contactName: z.string().trim().min(1, "required").max(120, "tooLong"),
  contactEmail: z.string().trim().toLowerCase().max(200, "tooLong").pipe(z.email("emailInvalid")),
  contactPhone: z
    .string()
    .trim()
    .min(6, "phoneInvalid")
    .max(30, "tooLong")
    .regex(/^\+?[0-9 ().-]+$/, "phoneInvalid"),
  specialRequests: z.string().trim().max(1000, "tooLong"),
});
export type UpdateContactInput = z.input<typeof updateContactSchema>;
export type UpdateContactValues = z.output<typeof updateContactSchema>;

export type BookingListRow = {
  id: string;
  code: string;
  status: Enums["booking_status"];
  paymentState: Enums["booking_payment_state"];
  startDate: string;
  tourCode: string;
  tourTitle: string;
  contactName: string;
  contactEmail: string;
  travellers: number;
  total: number;
  amountPaid: number;
  needsAttention: boolean;
  owner: string | null;
  createdAt: string;
};

export type AttentionItem = {
  id: string;
  code: string;
  status: Enums["booking_status"];
  paymentState: Enums["booking_payment_state"];
  reason: AttentionReason;
  /** Resolved with a note; derived reasons clear when their cause is dealt with. */
  resolvable: boolean;
  startDate: string;
  tourCode: string;
  contactName: string;
  total: number;
  amountPaid: number;
  balanceDueDate: string | null;
  since: string;
};

export type BookingDetail = {
  id: string;
  code: string;
  type: Enums["booking_type"];
  status: Enums["booking_status"];
  paymentState: Enums["booking_payment_state"];
  tourId: string;
  tourCode: string;
  tourTitle: string;
  departureId: string | null;
  departureStatus: Enums["departure_status"] | null;
  startDate: string;
  adults: number;
  children: number;
  infants: number;
  singleRooms: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactCountry: string | null;
  specialRequests: string | null;
  locale: Enums["locale"];
  subtotal: number;
  discountTotal: number;
  total: number;
  depositAmount: number;
  amountPaid: number;
  paymentPlan: Enums["payment_plan"];
  balanceDueDate: string | null;
  holdExpiresAt: string | null;
  needsAttention: boolean;
  attentionReason: AttentionReason | null;
  invoiceRequested: boolean;
  invoiceInfo: Record<string, string> | null;
  cancelReason: string | null;
  owner: string | null;
  createdAt: string;
  items: { id: string; type: Enums["booking_item_type"]; label: string; unitPrice: number; quantity: number; amount: number }[];
  travellers: { id: string; fullName: string; dateOfBirth: string | null; nationality: string | null; isLead: boolean }[];
  payments: {
    id: string;
    provider: Enums["payment_provider"];
    kind: Enums["payment_kind"];
    status: Enums["transaction_status"];
    amount: number;
    reference: string;
    paidAt: string | null;
    createdAt: string;
    note: string | null;
    recordedBy: string | null;
  }[];
  events: {
    id: string;
    type: string;
    fromStatus: Enums["booking_status"] | null;
    toStatus: Enums["booking_status"] | null;
    message: string | null;
    actor: string | null;
    createdAt: string;
  }[];
};

export type BookingActionError =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "not_cancellable"
  | "note_required"
  | "retry"
  | "failed";

export type BookingActionResult =
  | { ok: true; refundPercent?: number; refundAmount?: number }
  | { ok: false; error: BookingActionError; fields?: Record<string, string> };

/** Maps an error raised by the booking functions to a message key. */
export function bookingErrorCode(error: { code?: string; message?: string } | null): BookingActionError {
  if (!error) return "failed";
  if (error.code === "42501") return "forbidden";
  if (error.code === "P0002") return "not_found";
  if (error.code === "40P01" || error.code === "40001") return "retry";
  const known = ["not_cancellable", "note_required"] as const;
  return known.find((key) => error.message === key) ?? "failed";
}
