import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron authentication (spec Phase 5 decision 12): Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`. The SHA-256 digests of the received header and of the
 * expected one are compared in constant time; both digests are 32 bytes, so `timingSafeEqual`
 * (which throws on unequal lengths) always gets equal lengths and the comparison never reveals
 * the secret's length.
 *
 * - `unconfigured` (503): no CRON_SECRET, so the jobs never run (the env schema requires it in
 *   production);
 * - `unauthorized` (401): a missing or wrong header;
 * - `ok`.
 */
export type CronAuth = "ok" | "unauthorized" | "unconfigured";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function cronAuthorization(header: string | null | undefined, secret: string | null | undefined): CronAuth {
  if (!secret) return "unconfigured";
  const received = digest(header ?? "");
  const expected = digest(`Bearer ${secret}`);
  return timingSafeEqual(received, expected) ? "ok" : "unauthorized";
}

export function cronStatus(auth: CronAuth): 200 | 401 | 503 {
  return auth === "ok" ? 200 : auth === "unauthorized" ? 401 : 503;
}
