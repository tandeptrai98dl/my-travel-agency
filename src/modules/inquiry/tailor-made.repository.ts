import "server-only";

import type { Json } from "@/types/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

import { type InquiryInput, inquiryPayload } from "./tailor-made.schemas";

/** Guest write through the service role after validation, a rate limit and Turnstile (ARCHITECTURE "Guest writes"). */
export async function createTailorMadeInquiry(input: InquiryInput, privacyVersion: string, ip: string | null, userAgent: string | null) {
  return createAdminClient().rpc("create_tailor_made_inquiry", {
    payload: inquiryPayload(input) as unknown as Json,
    privacy_version: privacyVersion,
    ip: ip ?? undefined,
    user_agent: userAgent ?? undefined,
  });
}
