import { spawn, spawnSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { adminApi } from "./support/admin-api";

// Booking core under concurrency (docs/specs/phase-4-booking-payments.md PR 4A step 5). No browser:
// the Postgres functions are called at the same time through PostgREST with the service role, as
// the booking module and the payment webhooks do. pgTAP covers the sequential rules.

test.skip(!process.env.E2E_SUPABASE_SECRET_KEY, "needs the local Supabase stack (CI)");

type Db = ReturnType<typeof adminApi>;

// The seeded tour's own adult price: these departures must not change what other tests see on
// the tour page (its lowest price). Each test closes its departure when done.
const PRICE = 12_900_000;
const created: string[] = [];

test.afterAll(async () => {
  if (created.length) await adminApi().from("departures").update({ status: "closed" }).in("id", created);
});

async function departureWithOneSeat(db: Db, capacity = 1) {
  const { data: tour, error } = await db.from("tours").select("id").eq("code", "VN-HLB-03").single();
  if (error) throw error;
  // A date of its own (unique per tour), far from the seeded departures.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const offset = 200 + Math.floor(Math.random() * 150);
    const start = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + (offset + 2) * 86_400_000).toISOString().slice(0, 10);
    const inserted = await db
      .from("departures")
      .insert({ tour_id: tour.id, start_date: start, end_date: end, capacity, price_adult: PRICE })
      .select("id")
      .single();
    if (!inserted.error) {
      created.push(inserted.data.id);
      return { tourId: tour.id, departureId: inserted.data.id };
    }
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
    subtotal: PRICE,
    total: PRICE,
    deposit_amount: PRICE,
    items: [{ type: "adult", unit_price: PRICE, quantity: 1, amount: PRICE }],
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
        amount: PRICE,
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
  expect(booking).toEqual({ status: "confirmed", payment_state: "paid", amount_paid: PRICE });
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

/** Runs SQL in its own psql session (a second database connection the REST API cannot give). */
function psql(sql: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("psql", [process.env.E2E_DB_URL!, "-qXtA", "-v", "ON_ERROR_STOP=1", "-c", sql]);
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", () => resolve(out));
  });
}

const hasPsql = spawnSync("psql", ["--version"]).status === 0;

test("the hold-expiry job never waits on a booking a customer holds (no deadlock)", async () => {
  // PR 25 review: the job held a departure lock while waiting for a booking whose own function
  // waited for that departure. Reproduced with two sessions, as the reviewer did.
  test.skip(!process.env.E2E_DB_URL || !hasPsql, "needs psql and the local database URL (CI)");
  const db = adminApi();
  const { tourId, departureId } = await departureWithOneSeat(db, 3);
  const run = Date.now().toString(36).toUpperCase();
  const row = (n: number, minutesAgo: number) => ({
    code: `PTA-E2E${run}-${n}`,
    type: "instant" as const,
    status: "pending_payment" as const,
    tour_id: tourId,
    departure_id: departureId,
    start_date: new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10),
    adults: 1,
    contact_name: "Khách thử",
    contact_email: `deadlock-${run}-${n}@example.test`,
    contact_phone: "+84 900 000 000",
    locale: "vi" as const,
    subtotal: PRICE,
    total: PRICE,
    deposit_amount: PRICE,
    payment_plan: "full" as const,
    tour_snapshot: {},
    hold_expires_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  });
  const inserted = await db.from("bookings").insert([row(1, 20), row(2, 10)]).select("id, code");
  if (inserted.error) throw inserted.error;
  const [b1, b2] = [...inserted.data].sort((a, b) => a.code.localeCompare(b.code));
  const seats = await db.from("departures").update({ seats_reserved: 2 }).eq("id", departureId);
  if (seats.error) throw seats.error;

  const job = psql(`begin; select pg_sleep(0.5); select 'job', public.expire_holds(); commit;`);
  const customer = psql(
    `begin; select 'locked' from public.bookings where id = '${b2.id}' for update; select pg_sleep(2);
     select 'took', public.take_seats('${departureId}', 1); rollback;`,
  );
  const [jobOut, customerOut] = await Promise.all([job, customer]);
  expect(jobOut + customerOut).not.toContain("deadlock");
  expect(customerOut).toContain("took|t");
  // The job expired the free booking and skipped the one the customer held.
  expect(jobOut).toContain("job|");
  const { data: after } = await db.from("bookings").select("id, status").in("id", [b1.id, b2.id]);
  expect(after?.find((b) => b.id === b1.id)?.status).toBe("expired");
  expect(after?.find((b) => b.id === b2.id)?.status).toBe("pending_payment");

  // The next run picks it up, and the seats match the bookings again.
  await db.rpc("expire_holds");
  const { data: departure } = await db.from("departures").select("seats_reserved").eq("id", departureId).single();
  expect(departure?.seats_reserved).toBe(0);
});
