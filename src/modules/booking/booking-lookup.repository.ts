import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Guest lookup writes through the service role after validation, rate limits and Turnstile
 * (ARCHITECTURE "Guest writes"): issue_booking_lookup() stores the token hash only when the code
 * and the address match a booking with fewer than 3 open lookup tokens.
 */
export async function issueBookingLookup(code: string, email: string, tokenHash: string) {
  return createAdminClient().rpc("issue_booking_lookup", { target_code: code, email, token_hash: tokenHash });
}
