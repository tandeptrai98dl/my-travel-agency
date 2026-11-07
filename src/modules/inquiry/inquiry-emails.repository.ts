import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Inquiry emails are sent after a guest write (no staff session), so the row is read with the
 * service role, by id or by code, only inside `sendInquiryEmails()`.
 */
const COLUMNS =
  "id, code, name, email, locale, source, preferred_contact, company_name, adults, children, travel_month, flexible_dates, duration_days, budget_per_person, destination_ids, destinations_other, created_at, tour:tours(code, tour_translations(locale, title)), style:travel_styles(key, travel_style_translations(locale, name))";

export async function findInquiryForEmail(ref: { id: string } | { code: string }) {
  const query = createAdminClient().from("inquiries").select(COLUMNS);
  return "id" in ref ? query.eq("id", ref.id).maybeSingle() : query.eq("code", ref.code).maybeSingle();
}

export async function destinationNames(ids: string[]) {
  return createAdminClient().from("destination_translations").select("destination_id, locale, name").in("destination_id", ids);
}
