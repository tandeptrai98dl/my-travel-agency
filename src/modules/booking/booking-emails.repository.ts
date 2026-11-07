import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads for transactional email (service role: emails are sent from IPN routes and Server
 * Actions after the database commit, with no customer session). Never writes bookings.
 */
const db = createAdminClient;

export const EMAIL_BOOKING_COLUMNS =
  "id, code, type, locale, contact_name, contact_email, start_date, adults, children, infants, total, deposit_amount, amount_paid, payment_plan, balance_due_date, hold_expires_at, tour_snapshot, cancellation_policy_snapshot";

export async function findBookingForEmail(id: string) {
  return db().from("bookings").select(EMAIL_BOOKING_COLUMNS).eq("id", id).maybeSingle();
}

/** The booking's events since `since` (ISO), oldest first. */
export async function recentBookingEvents(id: string, since: string) {
  return db()
    .from("booking_events")
    .select("id, type, from_status, to_status, message, actor_id, created_at")
    .eq("booking_id", id)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(200);
}
