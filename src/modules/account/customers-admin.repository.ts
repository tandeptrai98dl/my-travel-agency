import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import type { CustomerSort, CustomerState } from "./customers-admin.schemas";

/**
 * Customers admin reads with the staff session (RLS: staff who read customers see profiles,
 * bookings and notes; inquiries per the inbox rules), and the role-checked definer functions for
 * consents and deletion requests. Only the data export reads with the service role, after the
 * MFA-verified admin check in the service (spec Phase 5 decision 16).
 */

export async function listCustomerRows(params: { q: string; state?: CustomerState; sort: CustomerSort; dir: "asc" | "desc"; range: [number, number] }) {
  let query = (await createClient())
    .from("profiles")
    .select("id, email, full_name, phone, country, created_at, deletion_requested_at, deleted_at", { count: "exact" })
    .eq("role", "customer")
    .order(params.sort, { ascending: params.dir === "asc", nullsFirst: false })
    .order("id")
    .range(params.range[0], params.range[1]);
  if (params.q) query = query.or(`email.ilike.%${params.q}%,full_name.ilike.%${params.q}%`);
  if (params.state === "deleted") query = query.not("deleted_at", "is", null);
  if (params.state === "requested") query = query.is("deleted_at", null).not("deletion_requested_at", "is", null);
  if (params.state === "active") query = query.is("deleted_at", null).is("deletion_requested_at", null);
  return query;
}

export async function findCustomer(id: string) {
  return (await createClient())
    .from("profiles")
    .select("id, email, full_name, phone, country, locale, marketing_consent, created_at, deletion_requested_at, deleted_at")
    .eq("id", id)
    .eq("role", "customer")
    .maybeSingle();
}

export async function customerBookings(id: string) {
  return (await createClient())
    .from("bookings")
    .select("id, code, status, payment_state, start_date, total, amount_paid, created_at, tour:tours(code)")
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
}

export async function customerInquiries(emailPattern: string) {
  return (await createClient())
    .from("inquiries")
    .select("id, code, status, source, created_at")
    .ilike("email", emailPattern)
    .order("created_at", { ascending: false })
    .limit(100);
}

export async function customerNotes(id: string) {
  return (await createClient())
    .from("internal_notes")
    .select("id, body, created_at, author:profiles!internal_notes_author_id_fkey(full_name, email)")
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
}

export async function addNote(row: Database["public"]["Tables"]["internal_notes"]["Insert"]) {
  return (await createClient()).from("internal_notes").insert(row);
}

export async function customerConsents(id: string) {
  return (await createClient()).rpc("customer_consents", { target_id: id });
}

export async function deletionRequests(id?: string) {
  return (await createClient()).rpc("admin_deletion_requests", id ? { target_id: id } : {});
}

/** The personal-data export (service role; the service checks the admin first). */
export async function dataExport(id: string) {
  return createAdminClient().rpc("customer_data_export", { target_id: id });
}

/** Exports of personal data are audit-logged first (ARCHITECTURE.md "Personal data"). */
export async function writeAuditRow(row: Database["public"]["Tables"]["audit_logs"]["Insert"]) {
  return createAdminClient().from("audit_logs").insert(row);
}
