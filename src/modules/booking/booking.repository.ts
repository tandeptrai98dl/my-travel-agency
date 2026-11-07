import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database.types";

/**
 * Booking data access with the service role (ARCHITECTURE.md "Data flow": guest writes after
 * Zod, Turnstile and rate limits). Seats and money change only through the Postgres functions
 * (ADR-012); this module never writes bookings, items or payments directly.
 */

type Provider = Database["public"]["Enums"]["payment_provider"];
type Kind = Database["public"]["Enums"]["payment_kind"];

const db = createAdminClient;

/** The departure and its tour's booking terms, for pricing. */
export async function findDepartureForBooking(departureId: string) {
  return db()
    .from("departures")
    .select(
      "id, tour_id, start_date, end_date, capacity, seats_reserved, status, price_adult, price_child, price_infant, single_supplement, tours!inner(id, status, type, min_pax, max_pax, deposit_percent, balance_due_days)",
    )
    .eq("id", departureId)
    .maybeSingle();
}

export async function findBooking(id: string) {
  return db()
    .from("bookings")
    .select("id, code, status, payment_state, tour_id, departure_id, total, deposit_amount, amount_paid, hold_expires_at")
    .eq("id", id)
    .maybeSingle();
}

/** What a stale draft is repriced from (the booking row is the source, never the browser). */
export async function findDraftForReprice(id: string) {
  return db()
    .from("bookings")
    .select(
      "id, status, customer_id, departure_id, locale, adults, children, infants, single_rooms, payment_plan, contact_name, contact_email, contact_phone, contact_country, special_requests, idempotency_key, invoice_requested, invoice_info",
    )
    .eq("id", id)
    .maybeSingle();
}

export async function createCheckoutDraft(input: {
  payload: Json;
  termsVersion: string | null;
  privacyVersion: string;
  marketing: boolean;
  ip: string | null;
  userAgent: string | null;
}) {
  return db().rpc("create_checkout_draft", {
    payload: input.payload,
    terms_version: input.termsVersion as string,
    privacy_version: input.privacyVersion,
    marketing: input.marketing,
    ip: input.ip as unknown as string,
    user_agent: input.userAgent as string,
  });
}

export async function bookingCutoffDays() {
  return db().rpc("booking_cutoff_days");
}

export async function createDraft(payload: Json) {
  return db().rpc("create_draft_booking", { payload });
}

export async function updateDraft(id: string, payload: Json) {
  return db().rpc("update_draft_booking", { target_id: id, payload });
}

export async function reserve(id: string, provider: Provider, kind: Kind) {
  return db().rpc("reserve_and_create_payment", { target_id: id, provider, kind });
}

export async function cancel(id: string, actor: string | null, reason: string) {
  // The generated type marks `actor` as a string; the function accepts null (the system).
  return db().rpc("cancel_booking", { target_id: id, actor: actor as string, reason });
}
