import "server-only";

import { validatedPublicEnv } from "@/lib/env/server";
import { logger } from "@/lib/logger";

/**
 * The email-confirmation guard (docs/specs/phase-5-accounts-inquiries-operations.md decision 6,
 * ADR-037). With "Confirm email" off, GoTrue sets `email_confirmed_at` at sign-up, so anyone could
 * register someone else's address and have that person's guest bookings attached to the new
 * account. GoTrue's public `/auth/v1/settings` reports that mode as `mailer_autoconfirm`; while it
 * is on, or cannot be read, nothing is attached and customer sign-up is off.
 */

const CACHE_MS = 5 * 60_000;
/** An unreadable answer is retried soon, so a short outage does not turn sign-up off for minutes. */
const FAILURE_MS = 30_000;
const TIMEOUT_MS = 3000;

export type ConfirmationGuard = { ok: true } | { ok: false; reason: "autoconfirm" | "unreachable" };

type Cached = { value: ConfirmationGuard; at: number; ttl: number };
let cached: Cached | null = null;

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/** Reads the settings once (no cache): exported for tests. */
export async function readConfirmationGuard(fetcher: Fetcher = fetch): Promise<ConfirmationGuard> {
  const url = `${validatedPublicEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/settings`;
  try {
    const response = await fetcher(url, {
      headers: { apikey: validatedPublicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: "unreachable" };
    const body = (await response.json()) as { mailer_autoconfirm?: unknown };
    if (body.mailer_autoconfirm === false) return { ok: true };
    // `true`, or a missing or odd value: never treat an unknown mode as safe.
    return { ok: false, reason: body.mailer_autoconfirm === true ? "autoconfirm" : "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/**
 * The guard, cached per server instance: five minutes for an answer GoTrue gave (on or off), 30
 * seconds when the settings could not be read. A refusal is logged once per period.
 * Timed with `performance.now()` (monotonic), which Next.js allows while rendering, unlike
 * `Date.now()`.
 */
export async function confirmationGuard(now = performance.now(), fetcher?: Fetcher): Promise<ConfirmationGuard> {
  if (cached && now - cached.at < cached.ttl) return cached.value;
  const value = await readConfirmationGuard(fetcher);
  cached = { value, at: now, ttl: !value.ok && value.reason === "unreachable" ? FAILURE_MS : CACHE_MS };
  if (!value.ok) logger.warn("auth.autoconfirm_guard", { reason: value.reason, attach: "refused", signUp: "disabled" });
  return value;
}

/** Tests only. */
export function resetConfirmationGuardCache(): void {
  cached = null;
}
