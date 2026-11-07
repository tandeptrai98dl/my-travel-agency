import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

/**
 * Quotes and payment links use the staff member's session: create_quote() and
 * create_payment_link() check the role again (can_act_as), after requirePermission().
 */

export async function createQuote(payload: Json) {
  return (await createClient()).rpc("create_quote", { payload });
}

export async function createPaymentLink(bookingId: string, tokenHash: string, validHours: number) {
  return (await createClient()).rpc("create_payment_link", { target_id: bookingId, token_hash: tokenHash, valid_hours: validHours });
}

export async function findInquiryByCode(code: string) {
  return (await createClient()).from("inquiries").select("id").eq("code", code).maybeSingle();
}

/** Tours a quote can be for: private tours first, then group tours (a private departure). */
export async function listQuoteTours() {
  return (await createClient())
    .from("tours")
    .select("id, code, type, deposit_percent, balance_due_days, tour_translations(locale, title)")
    .neq("status", "archived")
    // Quotes are for private tours only (create_quote() refuses group tours, #34 review).
    .eq("type", "private")
    .order("code", { ascending: true })
    .limit(500);
}
