import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { InquirySort, InquiryStatus } from "./inquiry-admin.schemas";

/**
 * The inbox reads and writes with the staff member's session: RLS decides which inquiries a role
 * sees (sales their own and unassigned ones, managers, operators and admins all), and status, owner
 * and first response change only through the definer functions of `*_inquiry_inbox.sql`, which
 * check the role again. API roles have no UPDATE on `inquiries`.
 */

const LIST_COLUMNS =
  "id, code, status, source, name, email, created_at, first_responded_at, tour:tours(code), owner:profiles!inquiries_assigned_to_fkey(full_name, email)";

export type InquiryListQuery = {
  q?: string;
  status?: InquiryStatus;
  source?: string;
  owner: { kind: "mine" | "unassigned" | "all" } | { kind: "user"; id: string };
  userId: string;
  sort: InquirySort;
  dir: "asc" | "desc";
  range: [number, number];
};

export async function findInquiries(query: InquiryListQuery) {
  const supabase = await createClient();
  let request = supabase
    .from("inquiries")
    .select(LIST_COLUMNS, { count: "exact" })
    .order(query.sort, { ascending: query.dir === "asc", nullsFirst: false })
    .order("id", { ascending: false })
    .range(query.range[0], query.range[1]);
  if (query.status) request = request.eq("status", query.status);
  if (query.source) request = request.eq("source", query.source);
  if (query.owner.kind === "mine") request = request.eq("assigned_to", query.userId);
  if (query.owner.kind === "unassigned") request = request.is("assigned_to", null);
  if (query.owner.kind === "user") request = request.eq("assigned_to", query.owner.id);
  if (query.q) {
    // Codes, names and e-mail addresses only: no PostgREST filter syntax reaches the query.
    const term = query.q.replace(/[^\p{L}\p{N}@._+ -]/gu, "").trim();
    if (term) request = request.or(`code.ilike.%${term}%,email.ilike.%${term}%,name.ilike.%${term}%`);
  }
  return request;
}

export async function findInquiry(id: string) {
  return (await createClient())
    .from("inquiries")
    .select(
      `id, code, status, source, locale, name, email, phone, country, company_name, preferred_contact, destination_ids,
       destinations_other, travel_month, flexible_dates, duration_days, adults, children, budget_per_person, message, utm,
       assigned_to, created_at, first_responded_at,
       tour:tours(id, code, type, tour_translations(locale, title)),
       style:travel_styles(key, travel_style_translations(locale, name)),
       owner:profiles!inquiries_assigned_to_fkey(full_name, email),
       booking:bookings(id, code, status),
       notes:internal_notes(id, body, created_at, author:profiles!internal_notes_author_id_fkey(full_name, email))`,
    )
    .eq("id", id)
    .maybeSingle();
}

export async function findInquiryByCode(code: string) {
  return (await createClient())
    .from("inquiries")
    .select("id, code, name, email, phone, locale, adults, children, travel_month, tour:tours(id, type, status), booking:bookings(id)")
    .eq("code", code)
    .maybeSingle();
}

export async function destinationNames(ids: string[]) {
  return (await createClient()).from("destination_translations").select("destination_id, locale, name").in("destination_id", ids);
}

export async function consents(id: string) {
  return (await createClient()).rpc("inquiry_consents", { target_id: id });
}

export async function activity(id: string) {
  return (await createClient()).rpc("inquiry_activity", { target_id: id });
}

export async function profileNames(ids: string[]) {
  return (await createClient()).from("profiles").select("id, full_name, email").in("id", ids);
}

/** Staff who can own inquiries (sales roles and admins, active), for assignment and the owner filter. */
export async function listAssignees() {
  return (await createClient())
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["sales", "sales_manager", "admin"])
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });
}

export async function assign(id: string, assignee: string | null) {
  // The generated Args type has no null; SQL reads a missing or null assignee as "nobody".
  return (await createClient()).rpc("assign_inquiry", { target_id: id, assignee: assignee as string });
}

export async function updateStatus(id: string, status: InquiryStatus, note: string) {
  return (await createClient()).rpc("update_inquiry_status", { target_id: id, new_status: status, note });
}

export async function addNote(id: string, body: string, contacted: boolean) {
  return (await createClient()).rpc("add_inquiry_note", { target_id: id, body, contacted });
}
