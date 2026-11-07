import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { RecordConsentInput } from "./consent.schemas";

/**
 * Cookie choices are a guest write (ARCHITECTURE.md "Guest writes"): the service role, after Zod
 * and the rate limit, and only through `record_cookie_consent()`; API roles have no access.
 */
export async function insertConsent(input: RecordConsentInput, bannerVersion: string) {
  return createAdminClient().rpc("record_cookie_consent", {
    p_id: input.id,
    p_action: input.action,
    p_analytics: input.analytics,
    p_marketing: input.marketing,
    p_banner_version: bannerVersion,
    p_locale: input.locale,
  });
}
