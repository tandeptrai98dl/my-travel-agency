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

/** The published terms page in one language (its version is recorded with the consent). */
export async function findPublishedTerms(locale: "vi" | "en") {
  return db()
    .from("page_translations")
    .select("title, content, pages!inner(key, status)")
    .eq("locale", locale)
    .eq("is_published", true)
    .eq("pages.key", "terms")
    .eq("pages.status", "published")
    .maybeSingle();
}

export async function paymentLinkState(tokenHash: string) {
  return db().rpc("payment_link_state", { token_hash: tokenHash });
}

/** The booking a payment link belongs to (the used-link page offers that checkout, step 14). */
export async function findLinkBooking(tokenHash: string) {
  return db().from("payment_links").select("booking_id, bookings!inner(code, locale)").eq("token_hash", tokenHash).maybeSingle();
}

/** An emailed checkout token's state for the booking named in the URL (no side effects). */
export async function accessTokenState(code: string, tokenHash: string) {
  return db().rpc("booking_access_token_state", { target_code: code, token_hash: tokenHash });
}

/** Uses an emailed checkout token once (ADR-038). */
export async function redeemAccessToken(code: string, tokenHash: string) {
  return db().rpc("redeem_booking_access_token", { target_code: code, token_hash: tokenHash });
}

export async function redeemPaymentLink(tokenHash: string) {
  return db().rpc("redeem_payment_link", { token_hash: tokenHash });
}
