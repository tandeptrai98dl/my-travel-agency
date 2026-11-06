import { createHmac } from "node:crypto";

import { adminApi } from "./admin-api";

/** Test setup for payment E2E: a departure of its own, drafts and holds through the functions. */
export async function testDeparture(capacity: number, price = 9_000_000) {
  const db = adminApi();
  const { data: tour, error } = await db.from("tours").select("id").eq("code", "VN-HLB-03").single();
  if (error) throw error;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const offset = 200 + Math.floor(Math.random() * 150);
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const inserted = await db
      .from("departures")
      .insert({ tour_id: tour.id, start_date: day(offset), end_date: day(offset + 2), capacity, price_adult: price })
      .select("id")
      .single();
    if (!inserted.error) return { tourId: tour.id, departureId: inserted.data.id, price };
  }
  throw new Error("could not create a test departure");
}

export async function heldBooking(
  departure: { tourId: string; departureId: string; price: number },
  provider: "vnpay" | "bank_transfer",
) {
  const db = adminApi();
  const key = `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const draft = await db.rpc("create_draft_booking", {
    payload: {
      idempotency_key: key,
      tour_id: departure.tourId,
      departure_id: departure.departureId,
      locale: "vi",
      adults: 1,
      children: 0,
      infants: 0,
      single_rooms: 0,
      contact_name: "Khách thử",
      contact_email: `${key}@example.test`,
      contact_phone: "+84 900 000 000",
      payment_plan: "full",
      subtotal: departure.price,
      total: departure.price,
      deposit_amount: departure.price,
      items: [{ type: "adult", unit_price: departure.price, quantity: 1, amount: departure.price }],
    },
  });
  if (draft.error || !draft.data) throw draft.error ?? new Error("no draft");
  const hold = await pay(draft.data, provider);
  return { bookingId: draft.data, ...hold };
}

export async function pay(bookingId: string, provider: "vnpay" | "bank_transfer") {
  const { data, error } = await adminApi().rpc("reserve_and_create_payment", { target_id: bookingId, provider, kind: "full" });
  if (error) throw error;
  return data as { reference: string; amount: number };
}

export async function booking(id: string) {
  const { data, error } = await adminApi()
    .from("bookings")
    .select("code, status, payment_state, amount_paid, needs_attention, attention_reason")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/** VNPay's signature, as the gateway (or the CI stub) computes it. */
export function vnpaySign(params: Record<string, string>, secret: string): string {
  const encode = (value: string) => encodeURIComponent(value).replace(/%20/g, "+");
  const data = Object.keys(params)
    .filter((key) => key.startsWith("vnp_") && key !== "vnp_SecureHash" && key !== "vnp_SecureHashType")
    .sort()
    .map((key) => `${encode(key)}=${encode(params[key])}`)
    .join("&");
  return createHmac("sha512", secret).update(data, "utf8").digest("hex");
}
