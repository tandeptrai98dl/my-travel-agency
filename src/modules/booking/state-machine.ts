import type { Database } from "@/types/database.types";

/**
 * Booking lifecycle (ARCHITECTURE.md "Booking lifecycle", docs/specs/phase-4-booking-payments.md
 * decision 3). The Postgres functions enforce the same transitions and write `booking_events`;
 * this module lets services and the admin know what is allowed before they call them.
 */

export type BookingStatus = Database["public"]["Enums"]["booking_status"];
export type PaymentState = Database["public"]["Enums"]["booking_payment_state"];

export const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  draft: ["pending_payment", "cancelled", "expired"],
  quoted: ["pending_payment", "cancelled", "expired"],
  pending_payment: ["confirmed", "expired", "cancelled"],
  // A late payment that finds seats confirms an expired booking (ADR-016).
  expired: ["confirmed"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const TERMINAL: readonly BookingStatus[] = ["completed", "cancelled"];

/** Statuses whose travellers hold seats on the departure (`check_seat_invariant()`). */
export const SEAT_HOLDING: readonly BookingStatus[] = ["pending_payment", "confirmed", "completed"];

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Customers may start (or restart) a payment from these. */
export function canStartPayment(status: BookingStatus, paymentState: PaymentState): boolean {
  if (status === "draft" || status === "quoted" || status === "pending_payment") return true;
  // Balance payments on a confirmed booking with money still due.
  return status === "confirmed" && paymentState === "deposit_paid";
}

export function canCancel(status: BookingStatus): boolean {
  return canTransition(status, "cancelled");
}

/** `payment_state` from the money received (refunds already subtracted from `amountPaid`). */
export function paymentStateFor(input: { amountPaid: number; total: number; deposit: number; refunded: number }): PaymentState {
  if (input.refunded > 0) return input.amountPaid <= 0 ? "refunded" : "partially_refunded";
  if (input.amountPaid >= input.total) return "paid";
  if (input.amountPaid >= input.deposit && input.amountPaid > 0) return "deposit_paid";
  return "unpaid";
}
