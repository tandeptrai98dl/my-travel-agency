import "server-only";

import { logger } from "@/lib/logger";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Whether both Turnstile keys are set (ADR-014). */
export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export function turnstileSiteKey(): string | null {
  return isTurnstileConfigured() ? (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null) : null;
}

/**
 * Verifies a Turnstile token on the server (Cloudflare siteverify). Fails closed: a missing
 * secret, a network error, a timeout or an unexpected action all count as "not verified".
 */
export async function verifyTurnstile(token: string, options: { action: string; ip?: string | null }): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (options.ip) body.set("remoteip", options.ip);
    const response = await fetch(VERIFY_URL, { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      logger.error("turnstile.request_failed", { status: response.status });
      return false;
    }
    const result = (await response.json()) as { success?: boolean; action?: string; "error-codes"?: string[] };
    // Cloudflare's test keys return no action; real widgets return the one they were rendered with.
    const actionMatches = !result.action || result.action === options.action;
    if (!result.success || !actionMatches) {
      logger.warn("turnstile.rejected", { codes: result["error-codes"]?.join(",") ?? null, action: result.action ?? null });
      return false;
    }
    return true;
  } catch (error) {
    logger.error("turnstile.unreachable", { message: error instanceof Error ? error.message : "unknown" });
    return false;
  }
}
