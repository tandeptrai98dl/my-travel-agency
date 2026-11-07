import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/modules/catalog/public/types";

/**
 * Guest writes for the newsletter go through the service role after validation, Turnstile and a
 * rate limit (ARCHITECTURE.md "Guest writes"), and only through the two Postgres functions.
 */
export async function requestSubscription(email: string, locale: Locale, tokenHash: string) {
  return createAdminClient().rpc("request_newsletter_subscription", {
    p_email: email,
    p_locale: locale,
    p_source: "homepage",
    p_token_hash: tokenHash,
  });
}

/** The withdrawal and its consent record, in one transaction (`unsubscribe_newsletter()`). */
export async function unsubscribe(tokenHash: string) {
  return createAdminClient().rpc("unsubscribe_newsletter", { p_token_hash: tokenHash });
}

export async function confirmSubscription(tokenHash: string, documentVersion: string, ip: string | null, userAgent: string | null) {
  return createAdminClient().rpc("confirm_newsletter_subscription", {
    p_token_hash: tokenHash,
    p_document_version: documentVersion,
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
  });
}
