import "server-only";

import { logger } from "@/lib/logger";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

import { bannerVersion } from "./banner-version";
import * as repo from "./consent.repository";
import type { RecordConsentInput, RecordConsentStatus } from "./consent.schemas";

/** Choices per IP per 10 minutes: far above what a person clicks, low enough to stop a flood. */
const IP_LIMIT = { limit: 20, window: 600 };

/**
 * Records one cookie choice (Phase 6 spec decision 7, ADR-039). The choice already applies in the
 * browser (the cookie is set before this runs); a refusal or failure here only means the proof is
 * missing, and the browser retries once on the next page view. The rate limit fails closed (the
 * ADR-029 rule for unauthenticated writes nobody reviews). Nothing logged here carries the record
 * id or the IP address.
 */
export async function recordConsent(input: RecordConsentInput, ip: string | null): Promise<RecordConsentStatus> {
  const limit = await rateLimit([rateLimitKey("cookie-consent-ip", ip ?? "unknown")], IP_LIMIT.limit, IP_LIMIT.window);
  if (limit === "unavailable") {
    // Error level: a gap in the proof of consent should show in Sentry.
    logger.error("consent.record_unavailable", { reason: "rate_limit" });
    return "unavailable";
  }
  if (limit === "limited") {
    logger.warn("consent.record_limited", {});
    return "rateLimited";
  }
  try {
    const { error } = await repo.insertConsent(input, await bannerVersion(input.locale));
    if (error) {
      logger.error("consent.record_failed", { code: error.code ?? null });
      return "failed";
    }
  } catch (error) {
    logger.error("consent.record_failed", { code: error instanceof Error ? error.name : "unknown" });
    return "failed";
  }
  return "recorded";
}
