import { createHash, randomBytes } from "node:crypto";

import { CONFIRM_TOKEN_DAYS } from "./newsletter.schemas";

/**
 * Confirmation tokens: `<issued at, base36 ms>.<24 random bytes, base64url>`. Only the SHA-256 of
 * the whole token is stored, so the issue time inside cannot be changed without breaking the hash.
 */
export function createConfirmToken(now: Date = new Date()): { token: string; hash: string } {
  const token = `${now.getTime().toString(36)}.${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

/**
 * Unsubscribe tokens (Phase 6 step 10a): 32 random bytes, base64url (43 characters), one per
 * subscriber per export; only the SHA-256 is stored, and each works once.
 */
export function createUnsubscribeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Whether a token was issued within the validity period (and not in the future). */
export function isTokenFresh(token: string, now: Date = new Date()): boolean {
  const issued = Number.parseInt(token.split(".")[0] ?? "", 36);
  if (!Number.isFinite(issued)) return false;
  const age = now.getTime() - issued;
  return age >= -60_000 && age <= CONFIRM_TOKEN_DAYS * 24 * 60 * 60 * 1000;
}
