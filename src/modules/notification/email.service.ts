import "server-only";

import { logger } from "@/lib/logger";

import * as repo from "./email.repository";

/**
 * Transactional email through the Resend REST API (ADR-014; a `fetch` client, like the Redis one,
 * so no SDK). Every attempt has a row in `email_logs`, without the message body:
 *
 * - The row is written **before** the send (`queued`). With a `dedupeKey` that insert is the
 *   claim: a second send with the same key hits the unique key, sends nothing and returns
 *   `duplicate` (exactly-once emails for booking events, spec Phase 4 decision 14).
 * - The outcome is then recorded on the row: `sent`, or `failed` with the provider's HTTP status
 *   or the error class only. Resend's error text is never stored or logged, because it can echo
 *   the recipient's address.
 * - Without RESEND_API_KEY and EMAIL_FROM nothing is sent: the row is written as `skipped` and
 *   callers get `unavailable`.
 *
 * Callers send after their database transaction has committed; a failed email never undoes it.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Template name for the send log, e.g. "newsletter_confirm". */
  template: string;
  /** Exactly-once key, e.g. `booking_confirmed:<booking_events.id>`. Omit for emails that may repeat. */
  dedupeKey?: string;
  bookingId?: string | null;
  inquiryId?: string | null;
};

export type SendResult = "sent" | "failed" | "unavailable" | "duplicate";

const UNIQUE_VIOLATION = "23505";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** What may be stored about a failed send: the HTTP status or the error class, nothing the provider wrote. */
export function sendError(outcome: { status: number } | { caught: unknown }): string {
  if ("status" in outcome) return `HTTP ${outcome.status}`;
  const name = outcome.caught instanceof Error ? outcome.caught.name : "";
  return /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
}

async function claim(message: EmailMessage, status: "queued" | "skipped"): Promise<{ id: string | null } | "duplicate" | "failed"> {
  const { data, error } = await repo.insertEmailLog({
    to_email: message.to,
    template: message.template,
    subject: message.subject,
    booking_id: message.bookingId ?? null,
    inquiry_id: message.inquiryId ?? null,
    dedupe_key: message.dedupeKey ?? null,
    status,
  });
  if (!error) return { id: data?.id ?? null };
  if (message.dedupeKey && error.code === UNIQUE_VIOLATION) return "duplicate";
  logger.error("email.log_failed", { template: message.template, code: error.code ?? null });
  // Without its row a keyed email could go out twice: send it only when repeats are harmless.
  return message.dedupeKey ? "failed" : { id: null };
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    const claimed = await claim(message, "skipped");
    if (claimed === "duplicate") return "duplicate";
    logger.warn("email.skipped", { template: message.template });
    return "unavailable";
  }

  const claimed = await claim(message, "queued");
  if (claimed === "duplicate" || claimed === "failed") return claimed;

  let status: "sent" | "failed" = "failed";
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as { id?: unknown };
      status = "sent";
      providerId = typeof body.id === "string" ? body.id.slice(0, 100) : null;
    } else {
      error = sendError({ status: response.status });
    }
  } catch (caught) {
    error = sendError({ caught });
  }
  if (status === "failed") logger.error("email.send_failed", { template: message.template, error });
  if (claimed.id) {
    const { error: logError } = await repo.updateEmailLog(claimed.id, { status, provider_message_id: providerId, error });
    if (logError) logger.error("email.log_failed", { template: message.template, code: logError.code ?? null });
  }
  return status;
}

/** Dedupe keys already claimed for a booking (sent, failed, skipped or in flight). */
export async function claimedEmailKeys(bookingId: string): Promise<{ keys: Set<string> } | { error: string }> {
  const { data, error } = await repo.claimedKeysForBooking(bookingId);
  if (error) return { error: error.code ?? "unknown" };
  return { keys: new Set((data ?? []).map((row) => row.dedupe_key).filter((key): key is string => typeof key === "string")) };
}

/** Escapes text for HTML email bodies. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
