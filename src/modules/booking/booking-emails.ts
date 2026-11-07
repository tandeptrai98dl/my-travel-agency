import type { ReactElement } from "react";

import { createTranslator } from "next-intl";

import { localizedPath } from "@/i18n/paths";

import { BalanceReminderEmail } from "../../../emails/balance-reminder";
import { BookingCancelledEmail } from "../../../emails/booking-cancelled";
import { BookingConfirmedEmail } from "../../../emails/booking-confirmed";
import { BookingLookupEmail } from "../../../emails/booking-lookup";
import { BookingReceivedEmail } from "../../../emails/booking-received";
import type { BookingFacts, EmailLocale, EmailT } from "../../../emails/components/booking";
import type { EmailBrand } from "../../../emails/components/layout";
import { PaymentLinkEmail } from "../../../emails/payment-link";
import { PaymentReceivedEmail } from "../../../emails/payment-received";
import { StaffBookingEmail } from "../../../emails/staff-booking";
import { attentionReason } from "./booking-admin.schemas";

/**
 * Which emails a booking's events call for, and how each is built (spec Phase 4 decision 14).
 * Pure: the service loads the rows, renders and sends. Every email is keyed on the booking event
 * that caused it (`<template>:<booking_events.id>`), so a replayed IPN, a retry or a second call
 * never sends it twice: `email_logs.dedupe_key` is unique.
 */

export type BookingEventRow = {
  id: string;
  type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  actor_id: string | null;
  created_at: string;
};

export type PlannedEmail =
  | { template: "booking_received"; key: string }
  | { template: "payment_received"; key: string; amount: number | null; flagged: boolean }
  | { template: "booking_confirmed"; key: string }
  | { template: "booking_cancelled"; key: string }
  | { template: "staff_booking_confirmed"; key: string }
  | { template: "staff_attention"; key: string; reason: string };

/** Statuses a customer has heard about before a cancellation (a draft or a lapsed hold gets no email). */
const CANCEL_NOTIFIED = new Set(["pending_payment", "confirmed", "quoted"]);

/** `record_payment_event()` writes `payment_received` with the message `<reference> <amount>`. */
export function amountFromEvent(message: string | null): number | null {
  const match = /\s(\d{1,15})$/.exec(message ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * The emails the events call for. Events of one transaction share `created_at` (Postgres `now()`),
 * so a payment that confirmed the booking sends "booking confirmed" alone, and a payment flagged
 * in the same transaction says so. Staff alerts are only for events the system raised (no actor):
 * staff who recorded a payment by hand already know.
 */
export function planBookingEmails(events: readonly BookingEventRow[]): PlannedEmail[] {
  const confirmedAt = new Set(events.filter((e) => e.type === "status_changed" && e.to_status === "confirmed").map((e) => e.created_at));
  const flaggedAt = new Set(events.filter((e) => e.type === "needs_attention").map((e) => e.created_at));
  const planned: PlannedEmail[] = [];
  for (const event of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    if (event.type === "status_changed" && event.to_status === "pending_payment" && event.from_status === "draft") {
      planned.push({ template: "booking_received", key: `booking_received:${event.id}` });
    } else if (event.type === "status_changed" && event.to_status === "confirmed") {
      planned.push({ template: "booking_confirmed", key: `booking_confirmed:${event.id}` });
      planned.push({ template: "staff_booking_confirmed", key: `staff_booking_confirmed:${event.id}` });
    } else if (event.type === "status_changed" && event.to_status === "cancelled" && CANCEL_NOTIFIED.has(event.from_status ?? "")) {
      planned.push({ template: "booking_cancelled", key: `booking_cancelled:${event.id}` });
    } else if (event.type === "payment_received" && !confirmedAt.has(event.created_at)) {
      planned.push({
        template: "payment_received",
        key: `payment_received:${event.id}`,
        amount: amountFromEvent(event.message),
        flagged: flaggedAt.has(event.created_at),
      });
    } else if (event.type === "needs_attention" && event.actor_id === null) {
      planned.push({ template: "staff_attention", key: `staff_attention:${event.id}`, reason: event.message ?? "" });
    }
  }
  return planned;
}

/** The booking row an email is built from (service role; see booking-emails.repository.ts). */
export type EmailBooking = {
  id: string;
  code: string;
  type: "instant" | "quoted";
  locale: EmailLocale;
  contact_name: string;
  contact_email: string;
  start_date: string;
  adults: number;
  children: number;
  infants: number;
  total: number;
  deposit_amount: number;
  amount_paid: number;
  payment_plan: "deposit" | "full";
  balance_due_date: string | null;
  hold_expires_at: string | null;
  tour_snapshot: unknown;
  cancellation_policy_snapshot: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function bookingFacts(booking: EmailBooking): BookingFacts {
  const snapshot = record(booking.tour_snapshot);
  const endDate = typeof snapshot.end_date === "string" ? snapshot.end_date : null;
  return {
    code: booking.code,
    tourTitle: typeof snapshot.title === "string" && snapshot.title.trim() ? snapshot.title.trim() : booking.code,
    startDate: booking.start_date,
    endDate,
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    total: booking.total,
    amountPaid: booking.amount_paid,
    balanceDueDate: booking.balance_due_date,
  };
}

function policySummary(booking: EmailBooking): string | null {
  const text = record(record(booking.cancellation_policy_snapshot).summary)[booking.locale];
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

/** What Pay asked for: the plan's amount less what is already paid. */
export function dueNow(booking: Pick<EmailBooking, "payment_plan" | "deposit_amount" | "total" | "amount_paid">): number {
  const target = booking.payment_plan === "deposit" ? booking.deposit_amount : booking.total;
  return Math.max(target - booking.amount_paid, 0);
}

/**
 * The checkout page of a booking (decision 7). With a token (`?access=<token>`, a single-use
 * random token from `booking_access_tokens`, ADR-038), the customer's click on the page opens the
 * booking once and sets a fresh access cookie. Without one the link opens only where the cookie
 * exists, or for the signed-in owner.
 */
export function checkoutUrl(booking: Pick<EmailBooking, "code" | "locale">, siteUrl: URL, token: string | null): string {
  const url = new URL(localizedPath(booking.locale, { pathname: "/checkout/[code]", params: { code: booking.code } }), siteUrl);
  if (token) url.searchParams.set("access", token);
  return url.toString();
}

/** Customer emails whose body links to the checkout (they get a fresh single-use token each). */
export const LINKED_TEMPLATES = new Set(["booking_received", "booking_confirmed", "balance_reminder"]);

export function adminBookingUrl(bookingId: string, siteUrl: URL): string {
  return new URL(`/admin/bookings/${encodeURIComponent(bookingId)}`, siteUrl).toString();
}

type Messages = Record<string, unknown>;

/** A translator over the `Emails` namespace that throws on a missing key (tests catch gaps). */
export function emailTranslator(locale: EmailLocale, messages: Messages): EmailT {
  const translate = createTranslator({
    locale,
    messages: messages as never,
    namespace: "Emails" as never,
    onError: (error) => {
      throw error;
    },
  });
  return (key, values) => (translate as unknown as (k: string, v?: Record<string, string | number>) => string)(key, values);
}

function reasonLabel(messages: Messages, reason: string): string {
  const reasons = record(record(record(messages.Admin).Bookings).reasons);
  const label = reasons[attentionReason(reason)];
  return typeof label === "string" ? label : reason;
}

export type BuildContext = {
  brand: EmailBrand;
  siteUrl: URL;
  /** Merged message trees per locale (`loadMessages`). */
  messages: Record<EmailLocale, Messages>;
};

export type BuiltEmail = {
  to: "customer" | "staff";
  template: string;
  subject: string;
  element: ReactElement;
};

/** The element and subject of one planned email. Staff alerts are always Vietnamese (ADR-006). */
export function buildBookingEmail(planned: PlannedEmail, booking: EmailBooking, context: BuildContext, checkoutToken: string | null = null): BuiltEmail {
  const facts = bookingFacts(booking);
  if (planned.template === "staff_booking_confirmed" || planned.template === "staff_attention") {
    const t = emailTranslator("vi", context.messages.vi);
    const kind = planned.template === "staff_booking_confirmed" ? "confirmed" : "attention";
    const reason = planned.template === "staff_attention" ? reasonLabel(context.messages.vi, planned.reason) : undefined;
    const subjectKey = kind === "confirmed" ? "staffConfirmed.subject" : "staffAttention.subject";
    return {
      to: "staff",
      template: planned.template,
      subject: t(subjectKey, { code: booking.code }),
      element: StaffBookingEmail({ locale: "vi", t, brand: context.brand, booking: facts, kind, reason, adminUrl: adminBookingUrl(booking.id, context.siteUrl) }),
    };
  }

  const locale = booking.locale;
  const t = emailTranslator(locale, context.messages[locale]);
  const base = { locale, t, brand: context.brand, booking: facts, name: booking.contact_name };
  const link = checkoutUrl(booking, context.siteUrl, checkoutToken);
  switch (planned.template) {
    case "booking_received":
      return {
        to: "customer",
        template: planned.template,
        subject: t("bookingReceived.subject", { code: booking.code }),
        element: BookingReceivedEmail({ ...base, dueNow: dueNow(booking), holdExpiresAt: booking.hold_expires_at, checkoutUrl: link }),
      };
    case "payment_received":
      return {
        to: "customer",
        template: planned.template,
        subject: t("paymentReceived.subject", { code: booking.code }),
        element: PaymentReceivedEmail({ ...base, amount: planned.amount, flagged: planned.flagged }),
      };
    case "booking_confirmed":
      return {
        to: "customer",
        template: planned.template,
        subject: t("bookingConfirmed.subject", { code: booking.code }),
        element: BookingConfirmedEmail({ ...base, policySummary: policySummary(booking), checkoutUrl: link }),
      };
    case "booking_cancelled":
      return {
        to: "customer",
        template: planned.template,
        subject: t("bookingCancelled.subject", { code: booking.code }),
        element: BookingCancelledEmail(base),
      };
  }
}

/** The payment link email of 4D. The URL (with its token) goes only into the body. */
export function buildPaymentLinkEmail(
  booking: EmailBooking,
  link: { url: string; amount: number; kind: "deposit" | "full" | "balance"; expiresAt: string },
  context: BuildContext,
): BuiltEmail {
  const t = emailTranslator(booking.locale, context.messages[booking.locale]);
  return {
    to: "customer",
    template: "payment_link",
    subject: t("paymentLink.subject", { code: booking.code }),
    element: PaymentLinkEmail({
      locale: booking.locale,
      t,
      brand: context.brand,
      booking: bookingFacts(booking),
      name: booking.contact_name,
      ...link,
    }),
  };
}

/** The balance reminder (scheduling arrives in Phase 5). */
export function buildBalanceReminderEmail(booking: EmailBooking, context: BuildContext, checkoutToken: string | null = null): BuiltEmail {
  const t = emailTranslator(booking.locale, context.messages[booking.locale]);
  return {
    to: "customer",
    template: "balance_reminder",
    subject: t("balanceReminder.subject", { code: booking.code }),
    element: BalanceReminderEmail({
      locale: booking.locale,
      t,
      brand: context.brand,
      booking: bookingFacts(booking),
      name: booking.contact_name,
      checkoutUrl: checkoutUrl(booking, context.siteUrl, checkoutToken),
    }),
  };
}

/** The guest lookup email (Phase 5 PR 5B): a single-use link to the checkout summary. */
export function buildBookingLookupEmail(booking: EmailBooking, link: { token: string; expiresAt: string }, context: BuildContext): BuiltEmail {
  const t = emailTranslator(booking.locale, context.messages[booking.locale]);
  return {
    to: "customer",
    template: "booking_lookup",
    subject: t("bookingLookup.subject", { code: booking.code }),
    element: BookingLookupEmail({
      locale: booking.locale,
      t,
      brand: context.brand,
      booking: bookingFacts(booking),
      name: booking.contact_name,
      checkoutUrl: checkoutUrl(booking, context.siteUrl, link.token),
      expiresAt: link.expiresAt,
    }),
  };
}
