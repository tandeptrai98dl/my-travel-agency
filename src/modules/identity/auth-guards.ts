import "server-only";

import { headers } from "next/headers";

import { serverEnv } from "@/lib/env/server";
import { logger } from "@/lib/logger";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isRedisConfigured } from "@/lib/redis";
import { isTurnstileConfigured, turnstileSiteKey, verifyTurnstile } from "@/lib/turnstile";

/**
 * Rate limits and Turnstile for the auth forms (docs/specs/phase-5-accounts-inquiries-operations.md
 * decision 2, ADR-029 fail modes).
 *
 * On Vercel (any `VERCEL_ENV`) both are enforced: Turnstile is required and every limit applies,
 * failing closed when Upstash is down, except sign-in, which fails open (logged). Off Vercel (local
 * development and CI, where the owner's Turnstile and Upstash accounts do not exist) a service
 * that is not configured is skipped with one warning, so sign-up can be tested end to end; a
 * configured one is always used.
 */

export function onVercel(): boolean {
  return serverEnv.VERCEL_ENV !== undefined;
}

export function turnstileRequired(): boolean {
  return onVercel() || isTurnstileConfigured();
}

function limitsEnforced(): boolean {
  return onVercel() || isRedisConfigured();
}

let warnedSkipped = false;

export type Limit = { scope: string; id: string; limit: number; window: number };

/** "ok", or why the request is refused. */
export async function checkLimits(limits: Limit[], options: { failOpen?: boolean } = {}): Promise<"ok" | "rate_limited" | "unavailable"> {
  if (!limitsEnforced()) {
    if (!warnedSkipped) {
      logger.warn("auth.rate_limits_skipped", { reason: "no_upstash_off_vercel" });
      warnedSkipped = true;
    }
    return "ok";
  }
  for (const item of limits) {
    const result = await rateLimit([rateLimitKey(item.scope, item.id)], item.limit, item.window, {
      failOpen: options.failOpen,
      scope: item.scope,
    });
    if (result === "limited") return "rate_limited";
    if (result === "unavailable") return "unavailable";
  }
  return "ok";
}

/** Verifies the form's Turnstile token where Turnstile is required. */
export async function checkTurnstile(token: string, action: string, ip: string | null): Promise<boolean> {
  if (!turnstileRequired()) return true;
  return verifyTurnstile(token, { action, ip });
}

/** The site key for the browser, or null when Turnstile is skipped (or not configured). */
export function authTurnstileSiteKey(): string | null {
  return turnstileSiteKey();
}

/** Whether forms that need Turnstile can work here (on Vercel the keys must exist). */
export function turnstileUsable(): boolean {
  return !turnstileRequired() || isTurnstileConfigured();
}

/** The client's IP as Vercel forwards it, and the user agent. */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip")?.trim() || null;
  const ip = forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : null;
  return { ip, userAgent: list.get("user-agent")?.slice(0, 500) ?? null };
}
