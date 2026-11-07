import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Guest access to a checkout (docs/specs/phase-4-booking-payments.md decision 7): one cookie per
 * booking, `booking_access_<code>`, holding an expiry and an HMAC-SHA256 of the booking id with
 * that expiry. Knowing a booking code alone opens nothing.
 */

export const ACCESS_DAYS = 7;
const ACCESS_MS = ACCESS_DAYS * 86_400_000;

export function accessCookieName(code: string): string {
  return `booking_access_${code.replace(/[^A-Za-z0-9]/g, "")}`;
}

function mac(secret: string, bookingId: string, expires: number): string {
  return createHmac("sha256", secret).update(`${bookingId}.${expires}`).digest("base64url");
}

export function signAccess(secret: string, bookingId: string, now = Date.now()): { value: string; expires: Date } {
  const expires = now + ACCESS_MS;
  return { value: `${expires}.${mac(secret, bookingId, expires)}`, expires: new Date(expires) };
}

export function verifyAccess(secret: string, bookingId: string, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + ACCESS_MS) return false;
  const expected = Buffer.from(mac(secret, bookingId, expires));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
