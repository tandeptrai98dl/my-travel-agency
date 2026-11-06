import "server-only";

import { logger } from "@/lib/logger";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isRedisConfigured } from "@/lib/redis";
import { isTurnstileConfigured, turnstileSiteKey, verifyTurnstile } from "@/lib/turnstile";
import { escapeHtml, isEmailConfigured, sendEmail } from "@/modules/notification/email.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

import * as repo from "./contact.repository";
import { type ContactInput, type ContactStatus, PRIVACY_CONSENT_VERSION } from "./contact.schemas";

/** Messages per IP per 10 minutes, and per address per hour. */
const IP_LIMIT = { limit: 5, window: 600 };
const EMAIL_LIMIT = { limit: 3, window: 3600 };

/**
 * The contact form needs Turnstile, Upstash (rate limits) and Resend (the staff notification).
 * Without any of them the form is shown disabled and the action refuses every request
 * (owner-blocked until the accounts exist; same pattern as the newsletter, ADR-029).
 */
export function contactAvailability(): { enabled: boolean; siteKey: string | null } {
  const enabled = isTurnstileConfigured() && isRedisConfigured() && isEmailConfigured();
  return { enabled, siteKey: enabled ? turnstileSiteKey() : null };
}

let reportedDisabled = false;

const CHANNEL_LABELS: Record<ContactInput["preferredContact"], string> = { email: "Email", phone: "Điện thoại", zalo: "Zalo", whatsapp: "WhatsApp" };

/** Staff notification (Vietnamese; the admin and its team work in Vietnamese). */
export function staffNotification(code: string, input: ContactInput) {
  const rows: [string, string][] = [
    ["Mã yêu cầu", code],
    ["Họ tên", input.name],
    ["Email", input.email],
    ["Điện thoại", input.phone ?? "—"],
    ["Liên hệ qua", CHANNEL_LABELS[input.preferredContact]],
    ["Tour", input.tourCode ?? "—"],
    ["Ngôn ngữ", input.locale === "vi" ? "Tiếng Việt" : "English"],
  ];
  const subject = `Liên hệ mới ${code} từ ${input.name}`;
  const html = `<!doctype html><html lang="vi"><body style="font-family:Arial,Helvetica,sans-serif;color:#0F1B2D;">
<h1 style="font-size:20px;">${escapeHtml(subject)}</h1>
<table cellpadding="6" style="border-collapse:collapse;">${rows
    .map(([label, value]) => `<tr><th align="left" style="border-bottom:1px solid #E2DBCF;">${escapeHtml(label)}</th><td style="border-bottom:1px solid #E2DBCF;">${escapeHtml(value)}</td></tr>`)
    .join("")}</table>
<p style="white-space:pre-wrap;">${escapeHtml(input.message)}</p>
<p style="color:#726D65;font-size:13px;">Trả lời trực tiếp cho khách qua email hoặc kênh khách chọn. Hộp thư yêu cầu trong trang quản trị có ở giai đoạn 5.</p>
</body></html>`;
  const text = [subject, "", ...rows.map(([label, value]) => `${label}: ${value}`), "", input.message].join("\n");
  return { subject, html, text };
}

type SubmitMeta = { turnstileToken: string; ip: string | null; userAgent: string | null };

/**
 * Saves a contact message as an inquiry (`source = 'contact'`) and notifies the team. Order per
 * ARCHITECTURE "Guest writes": the caller has validated with Zod; then the rate limit (fail
 * closed, ADR-029), Turnstile (fail closed), the service-role write, the email.
 */
export async function submitContact(input: ContactInput, meta: SubmitMeta): Promise<{ status: ContactStatus; code?: string }> {
  if (!contactAvailability().enabled) {
    if (!reportedDisabled) {
      logger.warn("contact.disabled", { turnstile: isTurnstileConfigured(), redis: isRedisConfigured(), email: isEmailConfigured() });
      reportedDisabled = true;
    }
    return { status: "unavailable" };
  }

  // Requests without a usable IP share one "unknown" bucket (never the case behind Vercel).
  const [byIp, byEmail] = await Promise.all([
    rateLimit([rateLimitKey("contact-ip", meta.ip ?? "unknown")], IP_LIMIT.limit, IP_LIMIT.window),
    rateLimit([rateLimitKey("contact-email", input.email)], EMAIL_LIMIT.limit, EMAIL_LIMIT.window),
  ]);
  if (byIp === "unavailable" || byEmail === "unavailable") return { status: "unavailable" };
  if (byIp === "limited" || byEmail === "limited") return { status: "rateLimited" };

  if (!(await verifyTurnstile(meta.turnstileToken, { action: "contact", ip: meta.ip }))) return { status: "verification" };

  const { data: code, error } = await repo.createContactInquiry(input, PRIVACY_CONSENT_VERSION, meta.ip, meta.userAgent);
  if (error || typeof code !== "string") {
    logger.error("contact.write_failed", { code: error?.code ?? null, message: error?.message ?? "no code" });
    return { status: "failed" };
  }

  // The message is saved: a failed notification is logged (email_logs) but not shown as a failure.
  const settings = await getPublicSettings();
  const to = settings.contact?.email;
  if (to) await sendEmail({ to, template: "contact_staff", ...staffNotification(code, input) });
  else logger.warn("contact.no_staff_email", { inquiry: code });
  return { status: "sent", code };
}
