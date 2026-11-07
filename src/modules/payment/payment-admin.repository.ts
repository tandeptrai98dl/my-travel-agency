import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import type { PaymentSort } from "./payment-admin.schemas";

type Enums = Database["public"]["Enums"];

/**
 * The payments ledger and the staff money functions use the staff member's session: RLS
 * (`payments: staff read`, `webhook_events: finance read`) and the role checks inside
 * record_manual_payment(), record_refund() and assign_unmatched_transfer() apply after
 * requirePermission() in the service.
 */

export type LedgerQuery = {
  q?: string;
  provider?: Enums["payment_provider"];
  status?: Enums["transaction_status"];
  kind?: Enums["payment_kind"];
  sort: PaymentSort;
  dir: "asc" | "desc";
  range: [number, number];
};

export async function findPayments(query: LedgerQuery) {
  let request = (await createClient())
    .from("payments")
    .select(
      "id, created_at, paid_at, provider, kind, status, amount, reference, note, booking:bookings!inner(id, code), recorder:profiles!payments_recorded_by_fkey(full_name, email)",
      { count: "exact" },
    )
    .order(query.sort, { ascending: query.dir === "asc", nullsFirst: false })
    .order("id", { ascending: false })
    .range(query.range[0], query.range[1]);
  if (query.provider) request = request.eq("provider", query.provider);
  if (query.status) request = request.eq("status", query.status);
  if (query.kind) request = request.eq("kind", query.kind);
  if (query.q) {
    // A reference is the booking code without dashes plus the attempt, so one filter finds both.
    const term = query.q.replace(/[^A-Za-z0-9]/g, "");
    if (term) request = request.ilike("reference", `%${term}%`);
  }
  return request;
}

export async function findUnmatchedTransfers() {
  return (await createClient())
    .from("webhook_events")
    .select("id, event_key, payload, received_at")
    .eq("provider", "bank_transfer")
    .eq("error", "unmatched")
    .order("received_at", { ascending: true })
    .limit(100);
}

export async function countUnmatchedTransfers() {
  return (await createClient())
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("provider", "bank_transfer")
    .eq("error", "unmatched");
}

export async function findBookingByCode(code: string) {
  return (await createClient()).from("bookings").select("id, tour_id").eq("code", code).maybeSingle();
}

export async function bookingTourId(id: string) {
  return (await createClient()).from("bookings").select("tour_id").eq("id", id).maybeSingle();
}

export async function recordManualPayment(id: string, amount: number, method: Enums["payment_provider"], note: string) {
  return (await createClient()).rpc("record_manual_payment", { target_id: id, amount, method, note });
}

export async function recordRefund(id: string, amount: number, method: Enums["payment_provider"], note: string) {
  return (await createClient()).rpc("record_refund", { target_id: id, amount, method, note });
}

export async function assignUnmatchedTransfer(eventId: string, bookingId: string, note: string) {
  return (await createClient()).rpc("assign_unmatched_transfer", { event_id: eventId, target_id: bookingId, note });
}
