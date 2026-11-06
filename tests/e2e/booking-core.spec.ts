import { expect, test } from "@playwright/test";

import { adminApi } from "./support/admin-api";

// Booking core under concurrency (docs/specs/phase-4-booking-payments.md PR 4A step 5). No browser:
// the Postgres functions are called at the same time through PostgREST with the service role, as
// the booking module and the payment webhooks do. pgTAP covers the sequential rules.

test.skip(!process.env.E2E_SUPABASE_SECRET_KEY, "needs the local Supabase stack (CI)");

type Db = ReturnType<typeof adminApi>;

async function departureWithOneSeat(db: Db) {
  const { data: tour, error } = await db.from("tours").select("id").eq("code", "VN-HLB-03").single();
  if (error) throw error;
  // A date of its own (unique per tour), far from the seeded departures.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const offset = 200 + Math.floor(Math.random() * 150);
    const start = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + (offset + 2) * 86_400_000).toISOString().slice(0, 10);
    const inserted = await db
      .from("departures")
      .insert({ tour_id: tour.id, start_date: start, end_date: end, capacity: 1, price_adult: 9_000_000 })
      .select("id")
      .single();
    if (!inserted.error) return { tourId: tour.id, departureId: inserted.data.id };
  }
  throw new Error("could not create a test departure");
}

function draft(key: string, tourId: string, departureId: string) {
  return {
    idempotency_key: key,
    tour_id: tourId,
    departure_id: departureId,
    locale: "vi",
    adults: 1,
    children: 0,
    infants: 0,
    single_rooms: 0,
    contact_name: "Khách thử",
    contact_email: `${key}@example.test`,
    contact_phone: "+84 900 000 000",
    payment_plan: "full",
    subtotal: 9_000_000,
    total: 9_000_000,
    deposit_amount: 9_000_000,
    items: [{ type: "adult", unit_price: 9_000_000, quantity: 1, amount: 9_000_000 }],
  };
}

test("two customers on the last seat: exactly one hold; ten copies of one IPN: one payment", async () => {
  const db = adminApi();
  const { tourId, departureId } = await departureWithOneSeat(db);
  const run = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const drafts = await Promise.all(
    ["a", "b"].map((who) => db.rpc("create_draft_booking", { payload: draft(`race-${run}-${who}`, tourId, departureId) })),
  );
  const ids = drafts.map(({ data, error }) => {
    if (error || !data) throw error ?? new Error("no draft");
    return data;
  });

  // Both customers click Pay at the same moment.
  const holds = await Promise.all(ids.map((id) => db.rpc("reserve_and_create_payment", { target_id: id, provider: "vnpay", kind: "full" })));
  const won = holds.filter((hold) => !hold.error);
  const lost = holds.filter((hold) => hold.error);
  expect(won).toHaveLength(1);
  expect(lost).toHaveLength(1);
  expect(lost[0].error?.message).toBe("sold_out");
  const { data: departure } = await db.from("departures").select("seats_reserved").eq("id", departureId).single();
  expect(departure?.seats_reserved).toBe(1);

  // The gateway sends the same IPN ten times at once.
  const reference = (won[0].data as { reference: string }).reference;
  const events = await Promise.all(
    Array.from({ length: 10 }, () =>
      db.rpc("record_payment_event", {
        provider: "vnpay",
        event_key: `ipn-${reference}`,
        payload: { vnp_TxnRef: reference },
        reference,
        amount: 9_000_000,
        provider_txn_id: `txn-${reference}`,
        succeeded: true,
      }),
    ),
  );
  const results = events.map(({ data, error }) => {
    if (error) throw error;
    return (data as { result: string }).result;
  });
  expect(results.filter((result) => result === "recorded")).toHaveLength(1);
  expect(results.filter((result) => result === "duplicate")).toHaveLength(9);

  const winner = ids[holds.findIndex((hold) => !hold.error)];
  const { data: booking } = await db.from("bookings").select("status, payment_state, amount_paid").eq("id", winner).single();
  expect(booking).toEqual({ status: "confirmed", payment_state: "paid", amount_paid: 9_000_000 });
  const { count } = await db
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", winner)
    .eq("status", "succeeded");
  expect(count).toBe(1);

  // Seats still match the bookings across the whole database.
  const invariant = await db.rpc("check_seat_invariant");
  expect(invariant.error).toBeNull();
  expect(invariant.data).toBe(0);
});
