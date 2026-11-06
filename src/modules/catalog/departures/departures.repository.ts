import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];

/**
 * Departure data access with the staff member's session, after requirePermission(). RLS: every
 * staff role reads; operator and admin write. Price guard (*_tour_rules.sql) and departure rules
 * (*_departure_rules.sql) apply on top; `seats_reserved` is never written here (ADR-012).
 */
const db = createClient;

const LIST_COLUMNS =
  "id, tour_id, start_date, end_date, capacity, seats_reserved, status, price_adult, note, tours(code, type, status, tour_translations(locale, title))";

export type DepartureQuery = {
  status?: Tables["departures"]["Row"]["status"];
  tourId?: string;
  /** Inclusive date range on `start_date`. */
  from?: string;
  to?: string;
};

export async function listDepartureRows(
  params: DepartureQuery & { sort: string; ascending: boolean; range: [number, number] },
) {
  const supabase = await db();
  let query = supabase
    .from("departures")
    .select(LIST_COLUMNS, { count: "exact" })
    .order(params.sort, { ascending: params.ascending })
    .order("start_date")
    .order("id")
    .range(params.range[0], params.range[1]);
  if (params.status) query = query.eq("status", params.status);
  if (params.tourId) query = query.eq("tour_id", params.tourId);
  if (params.from) query = query.gte("start_date", params.from);
  if (params.to) query = query.lte("start_date", params.to);
  return query;
}

/** Tours for the filter and the create form, with their Vietnamese (or English) titles. */
export async function listTourOptions() {
  const supabase = await db();
  return supabase
    .from("tours")
    .select("id, code, type, status, duration_days, max_pax, tour_translations(locale, title)")
    .order("code");
}

// Create (step 15) ----------------------------------------------------------------------------------

export async function findTourForDepartures(id: string) {
  const supabase = await db();
  return supabase
    .from("tours")
    .select("id, code, type, status, duration_days, max_pax, tour_translations(locale, title)")
    .eq("id", id)
    .maybeSingle();
}

/** Prices of the tour's latest departure: what guard_departure_prices() copies for non-admins. */
export async function latestDeparturePrices(tourId: string) {
  const supabase = await db();
  return supabase
    .from("departures")
    .select("price_adult, price_child, price_infant, single_supplement")
    .eq("tour_id", tourId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function existingStartDates(tourId: string, dates: string[]) {
  const supabase = await db();
  return supabase.from("departures").select("start_date").eq("tour_id", tourId).in("start_date", dates);
}

/**
 * Inserts the rows, skipping dates the tour already has (`unique (tour_id, start_date)`, so a
 * departure created meanwhile is skipped too); returns the start dates actually created.
 */
export async function insertDepartures(rows: Tables["departures"]["Insert"][]) {
  const supabase = await db();
  return supabase
    .from("departures")
    .upsert(rows, { onConflict: "tour_id,start_date", ignoreDuplicates: true })
    .select("start_date");
}

// Edit (step 16) -------------------------------------------------------------------------------------

export async function findDeparture(id: string) {
  const supabase = await db();
  return supabase
    .from("departures")
    .select(
      "id, tour_id, start_date, end_date, capacity, seats_reserved, status, price_adult, price_child, price_infant, single_supplement, note, tours(id, code, type, status, min_pax_to_operate, tour_translations(locale, title))",
    )
    .eq("id", id)
    .maybeSingle();
}

/** Other departures of the tour that are not cancelled (the last-departure rule). */
export async function countOtherActiveDepartures(tourId: string, excludeId: string) {
  const supabase = await db();
  const { count, error } = await supabase
    .from("departures")
    .select("id", { count: "exact", head: true })
    .eq("tour_id", tourId)
    .neq("status", "cancelled")
    .neq("id", excludeId);
  return { count: count ?? 0, error };
}

/** Bookings awaiting payment or confirmed (a security definer helper: staff see every booking). */
export async function hasOpenBookings(id: string) {
  return (await db()).rpc("departure_has_open_bookings", { target_id: id });
}

export async function updateDeparture(id: string, row: Tables["departures"]["Update"]) {
  return (await db()).from("departures").update(row).eq("id", id).select("id").maybeSingle();
}

export async function deleteDepartureRow(id: string) {
  return (await db()).from("departures").delete().eq("id", id).select("id");
}

export type DepartureRow = NonNullable<Awaited<ReturnType<typeof findDeparture>>["data"]>;

export type DepartureListRow = NonNullable<Awaited<ReturnType<typeof listDepartureRows>>["data"]>[number];
