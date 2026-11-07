import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads of the daily jobs (spec Phase 5 decisions 10 and 11). Cron routes have no user, so these
 * use the service role (ARCHITECTURE.md "Supabase clients"); they never write bookings.
 */
const db = createAdminClient;

/** Confirmed bookings with a balance and a due date up to `until` (overdue ones included). */
export async function balanceCandidates(until: string, from: number, to: number) {
  return db()
    .from("bookings")
    .select("id, status, total, amount_paid, balance_due_date")
    .eq("status", "confirmed")
    .not("balance_due_date", "is", null)
    .lte("balance_due_date", until)
    .order("balance_due_date", { ascending: true })
    .order("id")
    .range(from, to);
}

/** Which of these exactly-once keys are already claimed in `email_logs`. */
export async function claimedKeys(keys: string[]) {
  return db().from("email_logs").select("dedupe_key").in("dedupe_key", keys);
}

export async function bookingRules() {
  return db().from("settings").select("value").eq("key", "booking_rules").maybeSingle();
}

/** Departures within `days` below their tour's minimum (`departures_below_minimum()`). */
export async function departuresBelowMinimum(days: number) {
  return db().rpc("departures_below_minimum", { within_days: days });
}

/** Vietnamese tour titles for the alerts (staff emails are Vietnamese, ADR-006). */
export async function tourTitles(tourIds: string[]) {
  return db().from("tour_translations").select("tour_id, locale, title").in("tour_id", tourIds);
}
