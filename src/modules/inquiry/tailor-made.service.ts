import "server-only";

import { logger } from "@/lib/logger";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getPrivacyConsent } from "@/modules/content/public/content-public.service";

import { contactAvailability } from "./contact.service";
import * as repo from "./tailor-made.repository";
import type { InquiryInput, InquiryStatus } from "./tailor-made.schemas";

/** Spec decision 2: as the contact form, 5 per IP per 10 minutes and 3 per address per day; fail closed. */
const IP_LIMIT = { limit: 5, window: 600 };
const EMAIL_LIMIT = { limit: 3, window: 86_400 };

/** The same services as the contact form (Turnstile, Upstash, Resend); disabled without any. */
export const inquiryAvailability = contactAvailability;

let reportedDisabled = false;

type SubmitMeta = { turnstileToken: string; ip: string | null; userAgent: string | null };

/**
 * Saves a tailor-made or tour inquiry. Order per ARCHITECTURE "Guest writes" (as the contact form):
 * Zod in the action, the per-IP limit, Turnstile, the per-address limit, then the service-role
 * write with the published privacy policy's version (ADR-035).
 */
export async function submitInquiry(input: InquiryInput, meta: SubmitMeta): Promise<{ status: InquiryStatus; code?: string; id?: string }> {
  if (!inquiryAvailability().enabled) {
    if (!reportedDisabled) {
      logger.warn("inquiry.disabled");
      reportedDisabled = true;
    }
    return { status: "unavailable" };
  }
  const consent = await getPrivacyConsent(input.locale);
  if (!consent) {
    logger.warn("inquiry.no_privacy_page", { locale: input.locale });
    return { status: "unavailable" };
  }

  const byIp = await rateLimit([rateLimitKey("inquiry-ip", meta.ip ?? "unknown")], IP_LIMIT.limit, IP_LIMIT.window);
  if (byIp === "unavailable") return { status: "unavailable" };
  if (byIp === "limited") return { status: "rateLimited" };

  if (!(await verifyTurnstile(meta.turnstileToken, { action: "inquiry", ip: meta.ip }))) return { status: "verification" };

  const byEmail = await rateLimit([rateLimitKey("inquiry-email", input.email)], EMAIL_LIMIT.limit, EMAIL_LIMIT.window);
  if (byEmail === "unavailable") return { status: "unavailable" };
  if (byEmail === "limited") return { status: "rateLimited" };

  const { data, error } = await repo.createTailorMadeInquiry(input, consent.version, meta.ip, meta.userAgent);
  const saved = data as { id?: unknown; code?: unknown } | null;
  if (error || typeof saved?.code !== "string" || typeof saved.id !== "string") {
    logger.error("inquiry.write_failed", { code: error?.code ?? null, source: input.source });
    return { status: "failed" };
  }
  return { status: "sent", code: saved.code, id: saved.id };
}
