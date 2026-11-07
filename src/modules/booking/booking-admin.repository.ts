import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import type { BookingSort } from "./booking-admin.schemas";

type Enums = Database["public"]["Enums"];

/**
 * Staff reads and writes on bookings use the staff member's session, so RLS
 * (`bookings: staff read`, column grants) applies after requirePermission() in the service.
 * Money, seats and status change only through the definer functions of
 * `*_booking_admin.sql`, which check the role again.
 */

const LIST_COLUMNS =
  "id, code, status, payment_state, start_date, contact_name, contact_email, adults, children, total, amount_paid, needs_attention, created_at, tour_snapshot, tour:tours(code), owner:profiles!bookings_assigned_to_fkey(full_name, email)";

export type BookingListQuery = {
  q?: string;
  status?: Enums["booking_status"];
  tourId?: string;
  departureId?: string;
  ownerId?: string;
  attention?: boolean;
  sort: BookingSort;
  dir: "asc" | "desc";
  range: [number, number];
};

export async function findBookings(query: BookingListQuery) {
  const supabase = await createClient();
  let request = supabase
    .from("bookings")
    .select(LIST_COLUMNS, { count: "exact" })
    .order(query.sort, { ascending: query.dir === "asc" })
    .order("id", { ascending: false })
    .range(query.range[0], query.range[1]);
  if (query.status) request = request.eq("status", query.status);
  if (query.tourId) request = request.eq("tour_id", query.tourId);
  if (query.departureId) request = request.eq("departure_id", query.departureId);
  if (query.ownerId) request = request.eq("assigned_to", query.ownerId);
  if (query.attention) request = request.eq("needs_attention", true);
  if (query.q) {
    // Codes and e-mail addresses only: no PostgREST filter syntax reaches the query.
    const term = query.q.replace(/[^\p{L}\p{N}@._+-]/gu, "");
    if (term) request = request.or(`code.ilike.%${term}%,contact_email.ilike.%${term}%`);
  }
  return request;
}

const ATTENTION_COLUMNS =
  "id, code, status, payment_state, start_date, contact_name, total, amount_paid, balance_due_date, attention_reason, updated_at, tour:tours(code)";

export async function findFlaggedBookings() {
  return (await createClient())
    .from("bookings")
    .select(ATTENTION_COLUMNS)
    .eq("needs_attention", true)
    .order("updated_at", { ascending: true })
    .limit(200);
}

/** Confirmed bookings whose balance date has passed without the balance (ADR-016: never auto-cancel). */
export async function findOverdueBalances(today: string) {
  return (await createClient())
    .from("bookings")
    .select(ATTENTION_COLUMNS)
    .eq("status", "confirmed")
    .eq("payment_state", "deposit_paid")
    .lt("balance_due_date", today)
    .order("balance_due_date", { ascending: true })
    .limit(200);
}

/** Open bookings on a departure an admin cancelled. */
export async function findOnCancelledDepartures() {
  return (await createClient())
    .from("bookings")
    .select(`${ATTENTION_COLUMNS}, departure:departures!inner(status)`)
    .eq("departure.status", "cancelled")
    .in("status", ["pending_payment", "confirmed"])
    .order("start_date", { ascending: true })
    .limit(200);
}

export async function countFlagged() {
  return (await createClient())
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("needs_attention", true);
}

export async function findBooking(id: string) {
  const supabase = await createClient();
  return supabase
    .from("bookings")
    .select(
      `id, code, type, status, payment_state, tour_id, departure_id, start_date, adults, children, infants, single_rooms,
       contact_name, contact_email, contact_phone, contact_country, special_requests, locale, subtotal, discount_total,
       total, deposit_amount, amount_paid, payment_plan, balance_due_date, hold_expires_at, needs_attention,
       attention_reason, invoice_requested, invoice_info, cancel_reason, created_at, tour_snapshot,
       tour:tours(code), departure:departures(status), owner:profiles!bookings_assigned_to_fkey(full_name, email),
       items:booking_items(id, type, label, unit_price, quantity, amount),
       travellers(id, full_name, date_of_birth, nationality, is_lead),
       payments(id, provider, kind, status, amount, reference, paid_at, created_at, note,
                recorder:profiles!payments_recorded_by_fkey(full_name, email)),
       events:booking_events(id, type, from_status, to_status, message, created_at,
                actor:profiles(full_name, email))`,
    )
    .eq("id", id)
    .maybeSingle();
}

export async function bookingTourId(id: string) {
  return (await createClient()).from("bookings").select("tour_id").eq("id", id).maybeSingle();
}

export async function updateContact(
  id: string,
  patch: { contact_name: string; contact_email: string; contact_phone: string; special_requests: string | null },
) {
  return (await createClient()).from("bookings").update(patch).eq("id", id).select("id").maybeSingle();
}

export async function staffCancel(id: string, reason: string) {
  return (await createClient()).rpc("staff_cancel_booking", { target_id: id, reason });
}

export async function requestCancellation(id: string, note: string) {
  return (await createClient()).rpc("request_cancellation", { target_id: id, note });
}

export async function resolveAttention(id: string, note: string) {
  return (await createClient()).rpc("resolve_attention", { target_id: id, note });
}

/** Staff who own bookings (sales roles and admins), for the owner filter. */
export async function listOwners() {
  return (await createClient())
    .from("profiles")
    .select("id, full_name, email")
    .in("role", ["sales", "sales_manager", "admin"])
    .eq("is_active", true)
    .order("full_name", { ascending: true });
}

export async function listTours() {
  return (await createClient()).from("tours").select("id, code").order("code", { ascending: true }).limit(500);
}
