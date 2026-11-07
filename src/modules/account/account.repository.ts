import "server-only";

import type { Json } from "@/types/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Customer reads and writes with the customer's own session: the definer functions of
 * `*_customer_reads.sql` filter on `auth.uid()` and return a fixed set of columns (decision 5).
 */

export async function listBookings() {
  return (await createClient()).rpc("customer_bookings");
}

export async function getBooking(code: string) {
  return (await createClient()).rpc("customer_booking", { target_code: code });
}

export async function saveTravellers(code: string, travellers: Json) {
  return (await createClient()).rpc("save_customer_travellers", { target_code: code, travellers });
}

export async function getProfile(id: string) {
  return (await createClient())
    .from("profiles")
    .select("full_name, phone, country, locale, marketing_consent, email")
    .eq("id", id)
    .maybeSingle();
}

export async function updateProfile(id: string, values: { full_name: string; phone: string | null; country: string | null; locale: "vi" | "en" }) {
  return (await createClient()).from("profiles").update(values).eq("id", id).select("id").maybeSingle();
}

export async function setMarketingConsent(granted: boolean, documentVersion: string) {
  return (await createClient()).rpc("set_marketing_consent", { granted, document_version: documentVersion });
}
