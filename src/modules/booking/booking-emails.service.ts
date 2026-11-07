import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { after } from "next/server";

import { loadMessages } from "@/i18n/messages";
import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { siteUrl } from "@/lib/site-url";
import { renderEmail } from "@/modules/notification/render";
import { claimedEmailKeys, isEmailConfigured, type SendResult, sendEmail } from "@/modules/notification/email.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

import type { MinPaxFacts } from "../../../emails/staff-departure";

import {
  type BookingEventRow,
  type BuildContext,
  type BuiltEmail,
  buildBalanceOverdueEmail,
  buildBalanceReminderEmail,
  buildBookingLookupEmail,
  buildMinPaxEmail,
  buildBookingEmail,
  buildPaymentLinkEmail,
  type EmailBooking,
  LINKED_TEMPLATES,
  planBookingEmails,
} from "./booking-emails";
import * as repo from "./booking-emails.repository";

/**
 * Transactional booking emails (spec Phase 4 decision 14, PR 4E). Callers notify after their
 * database transaction has committed; the emails follow from the booking's events, each at most
 * once (`email_logs.dedupe_key`), and a failure is logged, never thrown back into the booking.
 * Only events of the last two days are considered, so a later call never mails old news.
 */
const RECENT_MS = 48 * 3_600_000;
/** Emailed checkout links work once within 7 days (ADR-038). */
const LINK_MINUTES = 7 * 24 * 60;

export async function buildContext(): Promise<BuildContext & { staffEmail: string | null }> {
  const [settings, vi, en] = await Promise.all([getPublicSettings(), loadMessages("vi"), loadMessages("en")]);
  const metadata = vi.Metadata;
  const siteName = metadata && typeof metadata === "object" && typeof metadata.siteName === "string" ? metadata.siteName : "";
  return {
    brand: { name: settings.company?.name ?? siteName, email: settings.contact?.email ?? null, phone: settings.contact?.phone ?? null },
    siteUrl,
    messages: { vi, en },
    staffEmail: settings.contact?.email ?? null,
  };
}

/**
 * A single-use checkout token for an email body (ADR-038): 32 random bytes, of which only the
 * SHA-256 is stored. Issued only when the email can actually be sent and guest checkout is on;
 * otherwise the link is plain (it opens where the access cookie exists, or for the owner).
 */
async function issueCheckoutToken(bookingId: string): Promise<string | null> {
  if (!isEmailConfigured() || !process.env.BOOKING_ACCESS_SECRET) return null;
  const token = randomBytes(32).toString("base64url");
  const { error } = await repo.issueAccessToken(bookingId, createHash("sha256").update(token).digest("hex"), LINK_MINUTES);
  if (error) {
    logger.error("booking.email_token_failed", { code: error.code ?? null });
    return null;
  }
  return token;
}

async function deliver(built: BuiltEmail, booking: EmailBooking, key: string, staffEmail: string | null): Promise<SendResult | null> {
  const to = built.to === "customer" ? booking.contact_email : staffEmail;
  if (!to) {
    logger.warn("booking.email_no_staff_address", { template: built.template, booking: booking.code });
    return null;
  }
  const { html, text } = await renderEmail(built.element);
  return sendEmail({ to, subject: built.subject, html, text, template: built.template, dedupeKey: key, bookingId: booking.id });
}

/** Sends every email the booking's recent events call for that has not been claimed yet. */
export async function sendBookingEmails(bookingId: string, now = Date.now()): Promise<void> {
  try {
    const since = new Date(now - RECENT_MS).toISOString();
    const [{ data: booking, error }, { data: events, error: eventsError }, claimed] = await Promise.all([
      repo.findBookingForEmail(bookingId),
      repo.recentBookingEvents(bookingId, since),
      claimedEmailKeys(bookingId),
    ]);
    if (error || eventsError || "error" in claimed || !booking) {
      const code = error?.code ?? eventsError?.code ?? ("error" in claimed ? claimed.error : null) ?? "not_found";
      logger.error("booking.email_load_failed", { code });
      return;
    }
    const done = claimed.keys;
    const pending = planBookingEmails((events ?? []) as BookingEventRow[]).filter((planned) => !done.has(planned.key));
    if (pending.length === 0) return;
    const context = await buildContext();
    for (const planned of pending) {
      try {
        const token = LINKED_TEMPLATES.has(planned.template) ? await issueCheckoutToken(bookingId) : null;
        await deliver(buildBookingEmail(planned, booking as EmailBooking, context, token), booking as EmailBooking, planned.key, context.staffEmail);
      } catch (caught) {
        logger.error("booking.email_failed", { template: planned.template, booking: booking.code, error: caught instanceof Error ? caught.name : "Error" });
      }
    }
  } catch (caught) {
    logger.error("booking.email_failed", { error: caught instanceof Error ? caught.name : "Error" });
  }
}

/** Runs a task after the response (Next.js `after()`); outside a request, in the background. */
function runAfterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/**
 * Sends the booking's pending emails after the response, so an IPN or a customer is never kept
 * waiting on Resend.
 */
export function notifyBooking(bookingId: string | null | undefined): void {
  if (!bookingId) return;
  runAfterResponse(() => sendBookingEmails(bookingId));
}

export type PaymentLinkEmailInput = {
  bookingId: string;
  /** The link shown once to staff (4D `createPaymentLink`); its token goes only into the body. */
  url: string;
  amount: number;
  kind: "deposit" | "full" | "balance";
  expiresAt: string;
};

/**
 * Emails a 4D payment link to the booking's contact, once per link: the key is a hash of the URL,
 * so the token itself is never stored in `email_logs` or written to a log line.
 */
export async function sendPaymentLinkEmail(input: PaymentLinkEmailInput): Promise<SendResult | "not_found"> {
  try {
    const { data: booking, error } = await repo.findBookingForEmail(input.bookingId);
    if (error || !booking) return "not_found";
    const context = await buildContext();
    const key = `payment_link:${createHash("sha256").update(input.url).digest("hex").slice(0, 40)}`;
    const built = buildPaymentLinkEmail(booking as EmailBooking, { url: input.url, amount: input.amount, kind: input.kind, expiresAt: input.expiresAt }, context);
    return (await deliver(built, booking as EmailBooking, key, context.staffEmail)) ?? "failed";
  } catch (caught) {
    logger.error("booking.email_failed", { template: "payment_link", error: caught instanceof Error ? caught.name : "Error" });
    return "failed";
  }
}

/**
 * The payment-link email after the staff action has answered (#36 review): the outcome is in
 * `email_logs` and on the booking page. Returns what the form can say now.
 */
export function queuePaymentLinkEmail(input: PaymentLinkEmailInput): "queued" | "skipped" {
  runAfterResponse(() => sendPaymentLinkEmail(input));
  return isEmailConfigured() ? "queued" : "skipped";
}

/**
 * The balance reminder for Phase 5's scheduler. `dedupeKey` names the reminder, e.g.
 * `balance_reminder:<booking id>:7d`, so each scheduled reminder goes out once.
 */
export async function sendBalanceReminder(bookingId: string, dedupeKey: string): Promise<SendResult | "not_found"> {
  try {
    const { data: booking, error } = await repo.findBookingForEmail(bookingId);
    if (error || !booking) return "not_found";
    const context = await buildContext();
    const token = await issueCheckoutToken(bookingId);
    return (await deliver(buildBalanceReminderEmail(booking as EmailBooking, context, token), booking as EmailBooking, dedupeKey, context.staffEmail)) ?? "failed";
  } catch (caught) {
    logger.error("booking.email_failed", { template: "balance_reminder", error: caught instanceof Error ? caught.name : "Error" });
    return "failed";
  }
}

/** The one-time team alert for an overdue balance (Phase 5 daily job); `dedupeKey` is `balance_overdue:<booking id>`. */
export async function sendBalanceOverdueAlert(bookingId: string, dedupeKey: string): Promise<SendResult | "not_found"> {
  try {
    const { data: booking, error } = await repo.findBookingForEmail(bookingId);
    if (error || !booking) return "not_found";
    const context = await buildContext();
    return (await deliver(buildBalanceOverdueEmail(booking as EmailBooking, context), booking as EmailBooking, dedupeKey, context.staffEmail)) ?? "failed";
  } catch (caught) {
    logger.error("booking.email_failed", { template: "balance_overdue", error: caught instanceof Error ? caught.name : "Error" });
    return "failed";
  }
}

/**
 * The minimum-traveller team alert for a departure (Phase 5 daily job), keyed
 * `min_pax:<departure id>:<days>d`. Without a team address nothing is claimed, so a later run
 * sends it once the address is set.
 */
export async function sendMinPaxAlert(departureId: string, facts: MinPaxFacts, dedupeKey: string): Promise<SendResult | "no_address"> {
  try {
    const context = await buildContext();
    if (!context.staffEmail) {
      logger.warn("booking.email_no_staff_address", { template: "min_pax" });
      return "no_address";
    }
    const built = buildMinPaxEmail(departureId, facts, context);
    const { html, text } = await renderEmail(built.element);
    return await sendEmail({ to: context.staffEmail, subject: built.subject, html, text, template: built.template, dedupeKey });
  } catch (caught) {
    logger.error("booking.email_failed", { template: "min_pax", error: caught instanceof Error ? caught.name : "Error" });
    return "failed";
  }
}

/**
 * The guest lookup email (spec Phase 5 decision 7), keyed `booking_lookup:<token id>`: one email
 * per issued token. The token goes only into the body. Without Resend the row is `skipped`.
 */
export async function sendBookingLookupEmail(input: { bookingId: string; tokenId: string; token: string; expiresAt: string }): Promise<SendResult | "not_found"> {
  try {
    const { data: booking, error } = await repo.findBookingForEmail(input.bookingId);
    if (error || !booking) return "not_found";
    const context = await buildContext();
    const built = buildBookingLookupEmail(booking as EmailBooking, { token: input.token, expiresAt: input.expiresAt }, context);
    return (await deliver(built, booking as EmailBooking, `booking_lookup:${input.tokenId}`, context.staffEmail)) ?? "failed";
  } catch (caught) {
    logger.error("booking.email_failed", { template: "booking_lookup", error: caught instanceof Error ? caught.name : "Error" });
    return "failed";
  }
}

/** Customer emails staff may send again from the booking page (4F "resend emails"). */
export const RESENDABLE_TEMPLATES = ["booking_received", "payment_received", "booking_confirmed", "booking_cancelled", "balance_reminder"] as const;

export type ResendResult = { ok: true; status: SendResult } | { ok: false; error: "not_found" | "not_resendable" | "failed" };

/**
 * Sends a customer email again with a fresh exactly-once key (`<original key>:resend:<id>`), rebuilt
 * from the booking as it is now (and, for event emails, from the event that caused it). Payment
 * links are never resent: their token is not stored; staff create a new link instead.
 */
export async function resendBookingEmail(logId: string): Promise<ResendResult> {
  const user = await requirePermission("bookings.edit");
  const { data: log } = await repo.findEmailLogForStaff(logId);
  if (!log?.booking_id || !log.dedupe_key) return { ok: false, error: "not_found" };
  const original = log.dedupe_key.split(":resend:")[0]!;
  const template = original.split(":")[0]!;
  if (!(RESENDABLE_TEMPLATES as readonly string[]).includes(template)) return { ok: false, error: "not_resendable" };
  try {
    const { data: booking } = await repo.findBookingForEmail(log.booking_id);
    if (!booking) return { ok: false, error: "not_found" };
    const context = await buildContext();
    const token = LINKED_TEMPLATES.has(template) ? await issueCheckoutToken(booking.id) : null;
    let built: BuiltEmail | null = null;
    if (template === "balance_reminder") {
      built = buildBalanceReminderEmail(booking as EmailBooking, context, token);
    } else {
      const eventId = original.slice(template.length + 1);
      const { data: group } = await repo.eventGroup(booking.id, eventId);
      const planned = planBookingEmails((group ?? []) as BookingEventRow[]).find((item) => item.key === original);
      if (planned) built = buildBookingEmail(planned, booking as EmailBooking, context, token);
    }
    if (!built) return { ok: false, error: "not_resendable" };
    const status = await deliver(built, booking as EmailBooking, `${original}:resend:${randomUUID()}`, context.staffEmail);
    if (!status) return { ok: false, error: "failed" };
    const { error } = await repo.logEmailResent(booking.id, user.id, template);
    if (error) logger.error("booking.email_resend_event_failed", { code: error.code ?? null });
    return { ok: true, status };
  } catch (caught) {
    logger.error("booking.email_failed", { template, error: caught instanceof Error ? caught.name : "Error" });
    return { ok: false, error: "failed" };
  }
}

export type BookingEmailRow = {
  id: string;
  template: string;
  status: string;
  to: string;
  createdAt: string;
  resend: boolean;
  /** Set for a resend: `<original key>:resend:…`. */
  isResend: boolean;
};

/** The booking's emails for its detail page (staff who read bookings, RLS). */
export async function listBookingEmails(bookingId: string): Promise<BookingEmailRow[]> {
  await requirePermission("bookings.read");
  const { data, error } = await repo.listBookingEmails(bookingId);
  if (error) {
    logger.error("booking.email_list_failed", { code: error.code ?? null });
    return [];
  }
  return (data ?? []).map((row) => {
    const original = row.dedupe_key?.split(":resend:")[0] ?? null;
    const template = original?.split(":")[0] ?? row.template;
    return {
      id: row.id,
      template: row.template,
      status: row.status,
      to: row.to_email,
      createdAt: row.created_at,
      resend: Boolean(original) && (RESENDABLE_TEMPLATES as readonly string[]).includes(template),
      isResend: Boolean(row.dedupe_key?.includes(":resend:")),
    };
  });
}
