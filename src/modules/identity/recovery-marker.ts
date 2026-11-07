import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Recovery marker (docs/specs/phase-5-accounts-inquiries-operations.md decision 1): `/auth/confirm`
 * sets it after verifying a recovery or invitation link, and the set-password pages accept only a
 * session whose user matches it. An ordinary session (a stolen cookie, an unlocked laptop) cannot
 * set a new password there without the current one.
 *
 * Value: `<user id>.<expires ms>.<HMAC-SHA256>`; the key is derived from the server's secret key,
 * so no new secret is needed.
 */

export const RECOVERY_COOKIE = "pta_recovery";
export const RECOVERY_MINUTES = 15;
const RECOVERY_MS = RECOVERY_MINUTES * 60_000;

function key(secret: string): Buffer {
  return createHmac("sha256", secret).update("pta:recovery-marker:v1").digest();
}

function mac(secret: string, userId: string, expires: number): string {
  return createHmac("sha256", key(secret)).update(`${userId}.${expires}`).digest("base64url");
}

export function signRecoveryMarker(secret: string, userId: string, now = Date.now()): { value: string; maxAge: number } {
  const expires = now + RECOVERY_MS;
  return { value: `${userId}.${expires}.${mac(secret, userId, expires)}`, maxAge: RECOVERY_MINUTES * 60 };
}

export function verifyRecoveryMarker(secret: string, userId: string, value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const match = /^([0-9a-f-]{36})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match || match[1] !== userId) return false;
  const expires = Number(match[2]);
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + RECOVERY_MS) return false;
  const expected = Buffer.from(mac(secret, userId, expires));
  const given = Buffer.from(match[3]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
