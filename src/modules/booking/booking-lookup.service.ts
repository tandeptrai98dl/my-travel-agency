import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { after } from "next/server";

import { logger } from "@/lib/logger";
import { isEmailConfigured } from "@/modules/notification/email.service";
import { checkLimits, checkTurnstile, onVercel, turnstileUsable } from "@/modules/identity/auth-guards";
import type { AuthState } from "@/modules/identity/customer-auth.schemas";

import { sendBookingLookupEmail } from "./booking-emails.service";
import * as repo from "./booking-lookup.repository";
import type { BookingLookupInput } from "./booking-lookup.schemas";

/** Spec decision 2: 5 per IP and 3 per code per 10 minutes; both fail closed (they send email). */
const IP_LIMIT = { limit: 5, window: 600 };
const CODE_LIMIT = { limit: 3, window: 600 };

/**
 * Whether the lookup form can work here. On Vercel it needs Turnstile and Resend (without Resend
 * nobody would get the link); off Vercel (local, CI) a missing service is skipped like the auth
 * forms do, and the email becomes a `skipped` row.
 */
export function bookingLookupAvailable(): boolean {
  return turnstileUsable() && (!onVercel() || isEmailConfigured());
}

type Issued = { token_id: string; booking_id: string; expires_at: string };

/** Issues the token and sends the email; never throws, logs no address and no token. */
export async function issueAndSendLookup(code: string, email: string): Promise<"sent" | "no_match" | "failed"> {
  try {
    const token = randomBytes(32).toString("base64url");
    const { data, error } = await repo.issueBookingLookup(code, email, createHash("sha256").update(token).digest("hex"));
    if (error) {
      logger.error("booking.lookup_issue_failed", { code: error.code ?? null });
      return "failed";
    }
    const issued = data as Issued | null;
    if (!issued?.token_id) return "no_match";
    const result = await sendBookingLookupEmail({ bookingId: issued.booking_id, tokenId: issued.token_id, token, expiresAt: issued.expires_at });
    return result === "failed" || result === "not_found" ? "failed" : "sent";
  } catch (caught) {
    logger.error("booking.lookup_failed", { error: caught instanceof Error ? caught.name : "Error" });
    return "failed";
  }
}

function runAfterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/**
 * The lookup form (decision 7): limits and Turnstile first, then always the same answer, returned
 * before any database or email work, which runs after the response. Whether anything matched is
 * never visible in the answer or its timing.
 */
export async function requestBookingLookup(input: BookingLookupInput, meta: { ip: string | null }): Promise<AuthState> {
  if (!bookingLookupAvailable()) return { status: "unavailable" };
  const byIp = await checkLimits([{ scope: "lookup-ip", id: meta.ip ?? "unknown", ...IP_LIMIT }]);
  if (byIp !== "ok") return { status: byIp };
  if (!(await checkTurnstile(input.turnstileToken, "lookup", meta.ip))) return { status: "turnstile" };
  const byCode = await checkLimits([{ scope: "lookup-code", id: input.code, ...CODE_LIMIT }]);
  if (byCode !== "ok") return { status: byCode };
  runAfterResponse(() => issueAndSendLookup(input.code, input.email));
  return { status: "sent" };
}
