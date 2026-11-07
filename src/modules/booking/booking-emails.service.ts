import "server-only";

import { createHash } from "node:crypto";

import { after } from "next/server";

import { loadMessages } from "@/i18n/messages";
import { logger } from "@/lib/logger";
import { siteUrl } from "@/lib/site-url";
import { renderEmail } from "@/modules/notification/render";
import { claimedEmailKeys, type SendResult, sendEmail } from "@/modules/notification/email.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

import {
  type BookingEventRow,
  type BuildContext,
  type BuiltEmail,
  buildBalanceReminderEmail,
  buildBookingEmail,
  buildPaymentLinkEmail,
  type EmailBooking,
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

async function buildContext(): Promise<BuildContext & { staffEmail: string | null }> {
  const [settings, vi, en] = await Promise.all([getPublicSettings(), loadMessages("vi"), loadMessages("en")]);
  const metadata = vi.Metadata;
  const siteName = metadata && typeof metadata === "object" && typeof metadata.siteName === "string" ? metadata.siteName : "";
  return {
    brand: { name: settings.company?.name ?? siteName, email: settings.contact?.email ?? null, phone: settings.contact?.phone ?? null },
    siteUrl,
    accessSecret: process.env.BOOKING_ACCESS_SECRET || undefined,
    messages: { vi, en },
    staffEmail: settings.contact?.email ?? null,
  };
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
        await deliver(buildBookingEmail(planned, booking as EmailBooking, context), booking as EmailBooking, planned.key, context.staffEmail);
      } catch (caught) {
        logger.error("booking.email_failed", { template: planned.template, booking: booking.code, error: caught instanceof Error ? caught.name : "Error" });
      }
    }
  } catch (caught) {
    logger.error("booking.email_failed", { error: caught instanceof Error ? caught.name : "Error" });
  }
}

/**
 * Sends the booking's pending emails after the response (Next.js `after()`), so an IPN or a
 * customer is never kept waiting on Resend. Outside a request it runs in the background.
 */
export function notifyBooking(bookingId: string | null | undefined): void {
  if (!bookingId) return;
  const task = () => sendBookingEmails(bookingId);
  try {
    after(task);
  } catch {
    void task();
  }
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
 * The balance reminder for Phase 5's scheduler. `dedupeKey` names the reminder, e.g.
 * `balance_reminder:<booking id>:7d`, so each scheduled reminder goes out once.
 */
export async function sendBalanceReminder(bookingId: string, dedupeKey: string): Promise<SendResult | "not_found"> {
  try {
    const { data: booking, error } = await repo.findBookingForEmail(bookingId);
    if (error || !booking) return "not_found";
    const context = await buildContext();
    return (await deliver(buildBalanceReminderEmail(booking as EmailBooking, context), booking as EmailBooking, dedupeKey, context.staffEmail)) ?? "failed";
  } catch (caught) {
    logger.error("booking.email_failed", { template: "balance_reminder", error: caught instanceof Error ? caught.name : "Error" });
    return "failed";
  }
}
