import "server-only";

import { logger } from "@/lib/logger";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isRedisConfigured } from "@/lib/redis";
import { isTurnstileConfigured, turnstileSiteKey, verifyTurnstile } from "@/lib/turnstile";
import { isEmailConfigured } from "@/modules/notification/email.service";
import { getPrivacyConsent } from "@/modules/content/public/content-public.service";

import * as repo from "./contact.repository";
import { type ContactInput, type ContactStatus } from "./contact.schemas";
import { sendInquiryEmails } from "./inquiry-emails.service";

/** Messages per IP per 10 minutes, and per address per hour. */
const IP_LIMIT = { limit: 5, window: 600 };
const EMAIL_LIMIT = { limit: 3, window: 3600 };

/**
 * The contact form needs Turnstile, Upstash (rate limits) and Resend (the inquiry emails).
 * Without any of them the form is shown disabled and the action refuses every request
 * (owner-blocked until the accounts exist; same pattern as the newsletter, ADR-029).
 */
export function contactAvailability(): { enabled: boolean; siteKey: string | null } {
  const enabled = isTurnstileConfigured() && isRedisConfigured() && isEmailConfigured();
  return { enabled, siteKey: enabled ? turnstileSiteKey() : null };
}

let reportedDisabled = false;

type SubmitMeta = { turnstileToken: string; ip: string | null; userAgent: string | null };

/**
 * Saves a contact message as an inquiry (`source = 'contact'`) and sends the inquiry emails. Order per
 * ARCHITECTURE "Guest writes": the caller has validated with Zod; then the per-IP rate limit
 * (fail closed, ADR-029), Turnstile (fail closed), the per-address rate limit (after Turnstile, so
 * an unverified visitor cannot use up someone else's allowance), the service-role write with the
 * version of the privacy policy the form linked, then the customer's acknowledgement and the team
 * alert (`sendInquiryEmails`, after the response).
 */
export async function submitContact(input: ContactInput, meta: SubmitMeta): Promise<{ status: ContactStatus; code?: string }> {
  if (!contactAvailability().enabled) {
    if (!reportedDisabled) {
      logger.warn("contact.disabled", { turnstile: isTurnstileConfigured(), redis: isRedisConfigured(), email: isEmailConfigured() });
      reportedDisabled = true;
    }
    return { status: "unavailable" };
  }
  // No published privacy policy in this language: nothing to agree to, so no message is taken.
  const consent = await getPrivacyConsent(input.locale);
  if (!consent) {
    logger.warn("contact.no_privacy_page", { locale: input.locale });
    return { status: "unavailable" };
  }

  // Requests without a usable IP share one "unknown" bucket (never the case behind Vercel).
  const byIp = await rateLimit([rateLimitKey("contact-ip", meta.ip ?? "unknown")], IP_LIMIT.limit, IP_LIMIT.window);
  if (byIp === "unavailable") return { status: "unavailable" };
  if (byIp === "limited") return { status: "rateLimited" };

  if (!(await verifyTurnstile(meta.turnstileToken, { action: "contact", ip: meta.ip }))) return { status: "verification" };

  const byEmail = await rateLimit([rateLimitKey("contact-email", input.email)], EMAIL_LIMIT.limit, EMAIL_LIMIT.window);
  if (byEmail === "unavailable") return { status: "unavailable" };
  if (byEmail === "limited") return { status: "rateLimited" };

  const { data: code, error } = await repo.createContactInquiry(input, consent.version, meta.ip, meta.userAgent);
  if (error || typeof code !== "string") {
    logger.error("contact.write_failed", { code: error?.code ?? null, message: error?.message ?? "no code" });
    return { status: "failed" };
  }

  // The message is saved: the acknowledgement and the team alert go out after the response; a
  // failed email is logged (email_logs) and never shown as a failure.
  sendInquiryEmails(code);
  return { status: "sent", code };
}
