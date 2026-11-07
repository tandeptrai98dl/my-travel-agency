import "server-only";

import { getTranslations } from "next-intl/server";

import { localizedPath } from "@/i18n/paths";
import { logger } from "@/lib/logger";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isRedisConfigured } from "@/lib/redis";
import { siteUrl } from "@/lib/site-url";
import { isTurnstileConfigured, turnstileSiteKey, verifyTurnstile } from "@/lib/turnstile";
import type { Locale } from "@/modules/catalog/public/types";
import { isEmailConfigured, sendEmail } from "@/modules/notification/email.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

import { getPrivacyConsent } from "./content-public.service";
import { confirmationEmail } from "./newsletter.email";
import * as repo from "./newsletter.repository";
import { type ConfirmStatus, type SubscribeStatus } from "./newsletter.schemas";
import { createConfirmToken, hashToken, isTokenFresh } from "./newsletter.token";

/** Sign-ups per IP per 10 minutes, and per address per day. */
const IP_LIMIT = { limit: 5, window: 600 };
const EMAIL_LIMIT = { limit: 3, window: 86_400 };

/**
 * Whether the sign-up can run: it needs Turnstile, Upstash (rate limits) and Resend (the
 * confirmation email). Without any of them the form shows a disabled state and the action refuses
 * every request: never an open endpoint (owner-blocked until the accounts exist).
 */
export function newsletterAvailability(): { enabled: boolean; siteKey: string | null } {
  const enabled = isTurnstileConfigured() && isRedisConfigured() && isEmailConfigured();
  return { enabled, siteKey: enabled ? turnstileSiteKey() : null };
}

let reportedDisabled = false;

type SubscribeInput = { email: string; locale: Locale; turnstileToken: string; ip: string | null };

/** Double opt-in, step 1: verify, rate-limit, store the token hash and send the link. */
export async function subscribe(input: SubscribeInput): Promise<SubscribeStatus> {
  if (!newsletterAvailability().enabled) {
    if (!reportedDisabled) {
      logger.warn("newsletter.disabled", {
        turnstile: isTurnstileConfigured(),
        redis: isRedisConfigured(),
        email: isEmailConfigured(),
      });
      reportedDisabled = true;
    }
    return "unavailable";
  }
  // The form asks for agreement to the privacy policy: without a published one, no sign-ups.
  if (!(await getPrivacyConsent(input.locale))) {
    logger.warn("newsletter.no_privacy_page", { locale: input.locale });
    return "unavailable";
  }

  // Requests without a usable IP (never the case behind Vercel) share one "unknown" bucket: a
  // stricter limit for them, accepted rather than skipping the IP limit.
  const keys = [rateLimitKey("newsletter-ip", input.ip ?? "unknown")];
  const [byIp, byEmail] = await Promise.all([
    // Fail closed (the default; ADR-029): an outage refuses sign-ups rather than opening them.
    rateLimit(keys, IP_LIMIT.limit, IP_LIMIT.window),
    rateLimit([rateLimitKey("newsletter-email", input.email)], EMAIL_LIMIT.limit, EMAIL_LIMIT.window),
  ]);
  if (byIp === "unavailable" || byEmail === "unavailable") return "unavailable";
  if (byIp === "limited" || byEmail === "limited") return "rateLimited";

  if (!(await verifyTurnstile(input.turnstileToken, { action: "newsletter", ip: input.ip }))) return "verification";

  const { token, hash } = createConfirmToken();
  const { data: shouldSend, error } = await repo.requestSubscription(input.email, input.locale, hash);
  if (error) {
    logger.error("newsletter.request_failed", { message: error.message });
    return "failed";
  }
  // An address that is already subscribed gets the same answer and no email (no address probing).
  if (shouldSend !== true) return "sent";

  const [t, settings] = await Promise.all([
    getTranslations({ locale: input.locale, namespace: "NewsletterEmail" }),
    getPublicSettings(),
  ]);
  const brand = settings.company?.name ?? (await getTranslations({ locale: input.locale, namespace: "Metadata" }))("siteName");
  const url = new URL(localizedPath(input.locale, { pathname: "/newsletter/confirm", query: { token } }), siteUrl).toString();
  const message = confirmationEmail({
    brand,
    url,
    locale: input.locale,
    strings: {
      subject: t("subject", { brand }),
      greeting: t("greeting"),
      body: t("body", { brand }),
      button: t("button"),
      expiry: t("expiry"),
      ignore: t("ignore"),
    },
  });
  const sent = await sendEmail({ to: input.email, template: "newsletter_confirm", ...message });
  return sent === "sent" ? "sent" : "failed";
}

type ConfirmInput = { token: string; locale: Locale; ip: string | null; userAgent: string | null };

/**
 * Double opt-in, step 2, from a button on the confirmation page (a POST, so mail scanners that
 * open links cannot confirm on the reader's behalf). Tokens carry 192 random bits, so no rate
 * limit is needed against guessing. The marketing consent is recorded with the version of the
 * privacy policy shown on the page (`getPrivacyConsent`); without a published one it waits.
 */
export async function confirm(input: ConfirmInput): Promise<ConfirmStatus> {
  if (!isTokenFresh(input.token)) return "invalid";
  // The consent recorded is to the privacy policy the confirmation page links, by its version.
  const consent = await getPrivacyConsent(input.locale);
  if (!consent) return "unavailable";
  const { data, error } = await repo.confirmSubscription(hashToken(input.token), consent.version, input.ip, input.userAgent);
  if (error) {
    logger.error("newsletter.confirm_failed", { message: error.message });
    return "unavailable";
  }
  return data === true ? "confirmed" : "invalid";
}
