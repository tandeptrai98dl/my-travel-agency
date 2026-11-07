import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Guest checkout reads and the consent write (docs/specs/phase-4-booking-payments.md decisions
 * 7–9). Guests have no API rights on bookings, so the booking module reads with the service role,
 * only after checkout.service.ts has checked the access cookie or the owning customer's session.
 */
const db = createAdminClient;

export async function findCheckoutByCode(code: string) {
  return db()
    .from("bookings")
    .select(
      "id, code, status, payment_state, customer_id, locale, start_date, adults, children, infants, single_rooms, contact_name, contact_email, total, deposit_amount, amount_paid, payment_plan, balance_due_date, hold_expires_at, tour_snapshot, cancellation_policy_snapshot, items:booking_items(type, unit_price, quantity, amount)",
    )
    .eq("code", code)
    .maybeSingle();
}

export async function findBookingCode(id: string) {
  return db().from("bookings").select("code").eq("id", id).maybeSingle();
}

/** The open attempt (bank transfer instructions are shown again after a reload). */
export async function findOpenPayment(bookingId: string) {
  return db()
    .from("payments")
    .select("provider, reference, amount, expires_at")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .neq("kind", "refund")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function checkoutStatus(code: string) {
  return db().rpc("booking_checkout_status", { target_code: code });
}

/** Versions of the terms and privacy pages the customer accepted (page key and last update). */
export async function findLegalPages() {
  return db().from("pages").select("key, updated_at").in("key", ["terms", "privacy"]);
}

export async function recordConsent(input: {
  bookingId: string;
  termsVersion: string;
  privacyVersion: string;
  marketing: boolean;
  ip: string | null;
  userAgent: string | null;
}) {
  return db().rpc("record_booking_consent", {
    target_id: input.bookingId,
    terms_version: input.termsVersion,
    privacy_version: input.privacyVersion,
    marketing: input.marketing,
    ip: input.ip as unknown as string,
    user_agent: input.userAgent as string,
  });
}
