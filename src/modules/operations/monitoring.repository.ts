import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads of the health-check job (docs/specs/phase-6-hardening-launch.md decision 3). Cron routes
 * have no user, so they use the service role after the CRON_SECRET check (ARCHITECTURE.md
 * "Supabase clients"); `cron_failures()` is executable by the service role only.
 */
export async function cronFailures(since: string) {
  return createAdminClient().rpc("cron_failures", { since });
}

/**
 * How many held bookings lapsed since `since` (`expire_holds()` in pg_cron, or at a read): their
 * seats went back to the departure, so cached tour cards must be refreshed.
 */
export async function lapsedHolds(since: string) {
  return createAdminClient()
    .from("booking_events")
    .select("id", { count: "exact", head: true })
    .eq("type", "status_changed")
    .eq("from_status", "pending_payment")
    .eq("to_status", "expired")
    .gte("created_at", since);
}
