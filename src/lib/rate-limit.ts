import "server-only";

import { createHash } from "node:crypto";

import { redisPipeline } from "@/lib/redis";

export type RateLimitResult = "ok" | "limited" | "unavailable";

/** Hashes an identifier (an IP or an email) so Redis never holds personal data in clear. */
export function rateLimitKey(scope: string, identifier: string): string {
  return `rl:${scope}:${createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex").slice(0, 32)}`;
}

/**
 * Fixed-window rate limit in Upstash Redis (ARCHITECTURE.md "Security"): INCR, and EXPIRE on the
 * first hit of a window. Every key must stay within `limit` hits. Without Redis, or when Redis
 * fails, the answer is "unavailable" and callers refuse the request (fail closed).
 */
export async function rateLimit(keys: string[], limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const commands = keys.flatMap((key) => [
    ["INCR", key],
    ["EXPIRE", key, windowSeconds, "NX"],
  ]);
  const result = await redisPipeline(commands);
  if (!result.configured || !result.ok) return "unavailable";
  const counts = result.results.filter((_, index) => index % 2 === 0).map(Number);
  return counts.every((count) => Number.isFinite(count) && count <= limit) ? "ok" : "limited";
}
