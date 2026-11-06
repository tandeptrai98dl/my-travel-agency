import "server-only";

import { logger } from "@/lib/logger";

import * as repo from "./email.repository";

/**
 * Transactional email through the Resend REST API (ADR-014; a `fetch` client, like the Redis one,
 * so no SDK). Every attempt is recorded in `email_logs` without the message body. Without
 * RESEND_API_KEY and EMAIL_FROM nothing is sent and callers get `unavailable`.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Template name for the send log, e.g. "newsletter_confirm". */
  template: string;
};

export type SendResult = "sent" | "failed" | "unavailable";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    logger.warn("email.not_configured", { template: message.template });
    return "unavailable";
  }
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
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (response.ok) {
      status = "sent";
      providerId = body.id ?? null;
    } else {
      error = `HTTP ${response.status}${body.message ? `: ${body.message.slice(0, 200)}` : ""}`;
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message.slice(0, 200) : "unknown";
  }
  if (status === "failed") logger.error("email.send_failed", { template: message.template, error });
  const { error: logError } = await repo.insertEmailLog({
    to_email: message.to,
    template: message.template,
    subject: message.subject,
    provider_message_id: providerId,
    status,
    error,
  });
  if (logError) logger.error("email.log_failed", { template: message.template, message: logError.message });
  return status;
}

/** Escapes text for HTML email bodies. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
