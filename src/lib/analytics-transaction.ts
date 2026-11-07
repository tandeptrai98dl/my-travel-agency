import "server-only";

import { createHmac } from "node:crypto";

import { serverEnv } from "@/lib/env/server";

/**
 * The GA4 `transaction_id` of a booking (ADR-039): a salted SHA-256 (HMAC) of the booking code,
 * 32 hex digits, so GA can deduplicate purchases without ever seeing the code. The salt is derived
 * from `BOOKING_ACCESS_SECRET` with its own label, so the value cannot be used as an access
 * signature; without the secret there is no online booking, and no purchase to report.
 */
export function analyticsTransactionId(code: string, secret: string | undefined = serverEnv.BOOKING_ACCESS_SECRET): string | null {
  if (!secret) return null;
  const salt = createHmac("sha256", secret).update("ga4-transaction-id").digest();
  return createHmac("sha256", salt).update(code).digest("hex").slice(0, 32);
}
