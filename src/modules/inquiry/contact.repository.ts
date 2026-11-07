import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { ContactInput } from "./contact.schemas";

/** Guest write through the service role after validation, Turnstile and a rate limit (ARCHITECTURE "Guest writes"). */
export async function createContactInquiry(input: ContactInput, consentVersion: string, ip: string | null, userAgent: string | null) {
  return createAdminClient().rpc("create_contact_inquiry", {
    p_name: input.name,
    p_email: input.email,
    // Optional values go as empty strings (the generated types have no null); SQL treats them as absent.
    p_phone: input.phone ?? "",
    p_preferred_contact: input.preferredContact,
    p_message: input.message,
    p_locale: input.locale,
    p_tour_code: input.tourCode ?? "",
    p_privacy_version: consentVersion,
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
  });
}
