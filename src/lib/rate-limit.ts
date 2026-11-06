import "server-only";

import { createHash } from "node:crypto";

import { logger } from "@/lib/logger";
import { redisPipeline } from "@/lib/redis";

export type RateLimitResult = "ok" | "limited" | "unavailable";

/** Hashes an identifier (an IP or an email) so Redis never holds personal data in clear. */
export function rateLimitKey(scope: string, identifier: string): string {
  return `rl:${scope}:${createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex").slice(0, 32)}`;
}

type Options = {
  /**
   * What happens without Redis or when Redis fails. Default: "unavailable", and the caller
   * refuses the request (fail closed; the newsletter, ADR-029). `failOpen: true` answers "ok"
   * and logs a warning instead (Phase 4 booking and payment start, ADR-033).
   */
  failOpen?: boolean;
  /** Name for the log line when failing open. */
  scope?: string;
};

/**
 * Fixed-window rate limit in Upstash Redis (ARCHITECTURE.md "Security"): INCR, and EXPIRE on the
 * first hit of a window. Every key must stay within `limit` hits.
 */
export async function rateLimit(keys: string[], limit: number, windowSeconds: number, options: Options = {}): Promise<RateLimitResult> {
  const commands = keys.flatMap((key) => [
    ["INCR", key],
    ["EXPIRE", key, windowSeconds, "NX"],
  ]);
  const result = await redisPipeline(commands);
  if (!result.configured || !result.ok) {
    if (!options.failOpen) return "unavailable";
    logger.warn("rate_limit.fail_open", { scope: options.scope ?? null, configured: result.configured });
    return "ok";
  }
  const counts = result.results.filter((_, index) => index % 2 === 0).map(Number);
  return counts.every((count) => Number.isFinite(count) && count <= limit) ? "ok" : "limited";
}
