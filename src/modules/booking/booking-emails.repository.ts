import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

/** Stores the hash of a single-use emailed checkout token (ADR-038). */
export async function issueAccessToken(bookingId: string, tokenHash: string, validMinutes: number) {
  return db().rpc("issue_booking_access_token", { target_id: bookingId, purpose: "email", token_hash: tokenHash, valid_minutes: validMinutes });
}

/** The events of one transaction (they share `created_at`), from the event an email was keyed on. */
export async function eventGroup(bookingId: string, eventId: string) {
  const { data: event, error } = await db().from("booking_events").select("created_at").eq("id", eventId).eq("booking_id", bookingId).maybeSingle();
  if (error || !event) return { data: null, error };
  return db()
    .from("booking_events")
    .select("id, type, from_status, to_status, message, actor_id, created_at")
    .eq("booking_id", bookingId)
    .eq("created_at", event.created_at);
}

/** An email row as the signed-in staff member may read it (RLS: staff who read bookings). */
export async function findEmailLogForStaff(id: string) {
  return (await createClient()).from("email_logs").select("id, booking_id, template, dedupe_key").eq("id", id).maybeSingle();
}

/** The booking's emails for its detail page, newest first (RLS as above). */
export async function listBookingEmails(bookingId: string) {
  return (await createClient())
    .from("email_logs")
    .select("id, template, status, to_email, dedupe_key, error, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(50);
}

/** A timeline entry for a resend, written by the staff member (RLS: `actor_id = auth.uid()`). */
export async function logEmailResent(bookingId: string, actorId: string, template: string) {
  return (await createClient()).from("booking_events").insert({ booking_id: bookingId, type: "email_resent", message: template, actor_id: actorId });
}
