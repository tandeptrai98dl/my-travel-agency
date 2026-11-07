import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import type { SubscriberState } from "./subscribers.schemas";

/** Subscribers with the staff session (RLS: editor and admin read). */
const db = createClient;

function byState<Q extends { not: (c: string, o: string, v: null) => Q; is: (c: string, v: null) => Q }>(query: Q, state?: SubscriberState): Q {
  if (state === "active") return query.not("confirmed_at", "is", null).is("unsubscribed_at", null);
  if (state === "pending") return query.is("confirmed_at", null).is("unsubscribed_at", null);
  if (state === "unsubscribed") return query.not("unsubscribed_at", "is", null);
  return query;
}

export async function listSubscriberRows(params: { q: string; state?: SubscriberState; range: [number, number] }) {
  let query = (await db())
    .from("subscribers")
    .select("id, email, locale, source, confirmed_at, unsubscribed_at, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id")
    .range(params.range[0], params.range[1]);
  if (params.q) query = query.ilike("email", `%${params.q}%`);
  return byState(query, params.state);
}

/** Active subscribers for the export, in pages. */
export async function activeSubscriberRows(from: number, to: number) {
  const query = (await db())
    .from("subscribers")
    .select("id, email, locale, source, confirmed_at, created_at")
    .order("created_at")
    .order("id")
    .range(from, to);
  return byState(query, "active");
}

/**
 * Exports of personal data are written to the audit log (ARCHITECTURE.md "Personal data"). API
 * roles cannot write `audit_logs`, so this row goes through the service role, after the
 * permission check, naming the staff member.
 */
export async function writeAuditRow(row: Database["public"]["Tables"]["audit_logs"]["Insert"]) {
  return createAdminClient().from("audit_logs").insert(row);
}

/**
 * Stores the hashes of the export's fresh unsubscribe tokens (Phase 6 step 10a), active
 * subscribers only, through the service-role function after the permission check and the audit
 * row; the plaintext tokens exist only in the exported file.
 */
export async function issueUnsubscribeTokens(subscriberIds: string[], tokenHashes: string[]) {
  return createAdminClient().rpc("issue_newsletter_unsubscribe_tokens", { p_subscriber_ids: subscriberIds, p_token_hashes: tokenHashes });
}
