import { expect, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { signInAs } from "./support/auth";
import { booking, closeTestDepartures, heldBooking, testDeparture } from "./support/booking";

// Phase 5 PR 5D (docs/specs/phase-5-accounts-inquiries-operations.md decisions 10–12): the cron
// routes refuse requests without the secret; with it, balance reminders go out for the smallest
// window once, an overdue balance alerts the team once and shows as a derived attention reason
// (never cancelled), and departures below their minimum alert the team.

test.describe.configure({ mode: "serial" });
test.afterAll(closeTestDepartures);

const ROUTES = ["/api/cron/balance-reminders", "/api/cron/departure-checks", "/api/cron/health-checks", "/api/cron/housekeeping"];
const secret = process.env.CRON_SECRET;

function vietnamDay(offset: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
}

async function keysLike(prefix: string) {
  const { data, error } = await adminApi().from("email_logs").select("dedupe_key, template, status").like("dedupe_key", `${prefix}%`);
  if (error) throw error;
  return data ?? [];
}

/** A confirmed booking with a third paid and the balance due on `due` (a Vietnam date). */
async function confirmedWithBalance(due: string) {
  const held = await heldBooking(await testDeparture(4), "bank_transfer");
  const { data, error } = await adminApi()
    .from("bookings")
    .update({ status: "confirmed", payment_state: "deposit_paid", amount_paid: 4_300_000, balance_due_date: due, hold_expires_at: null })
    .eq("id", held.bookingId)
    .select("id, code")
    .single();
  if (error) throw error;
  return data;
}

test("cron routes refuse requests without the secret", async ({ request }) => {
  // Without CRON_SECRET on the server (local runs) the routes answer 503 to everyone.
  const refused = secret ? 401 : 503;
  for (const path of ROUTES) {
    expect((await request.get(path)).status(), path).toBe(refused);
    expect((await request.get(path, { headers: { Authorization: "Bearer not-the-secret" } })).status(), path).toBe(refused);
    expect((await request.get(path, { headers: { Authorization: `Bearer ${secret ?? ""}x` } })).status(), path).toBe(refused);
    expect((await request.post(path, { headers: { Authorization: `Bearer ${secret ?? ""}` } })).status(), path).toBe(405);
  }
});

test("balance reminders: the smallest window once, an overdue balance flagged and alerted once, never cancelled", async ({ page, request }) => {
  test.skip(!secret, "needs CRON_SECRET (CI)");
  test.setTimeout(90_000);
  const soon = await confirmedWithBalance(vietnamDay(1));
  const week = await confirmedWithBalance(vietnamDay(6));
  const late = await confirmedWithBalance(vietnamDay(-1));
  const run = async () => {
    const response = await request.get(ROUTES[0]!, { headers: { Authorization: `Bearer ${secret}` } });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.json();
    // Counts only: no addresses or codes in the answer.
    expect(JSON.stringify(body)).not.toMatch(/@|PTA-/);
    return body as { ok: boolean; reminders: { considered: number }; overdue: { considered: number } };
  };

  expect((await run()).ok).toBe(true);
  // 1 day left: the 2-day reminder only (the 7-day one is never sent once 2 days apply).
  expect((await keysLike(`balance_reminder:${soon.id}`)).map((row) => row.dedupe_key)).toEqual([`balance_reminder:${soon.id}:2d`]);
  // 6 days left: the 7-day reminder (a missed 7-day run still sends it).
  expect((await keysLike(`balance_reminder:${week.id}`)).map((row) => row.dedupe_key)).toEqual([`balance_reminder:${week.id}:7d`]);
  // Overdue: no reminder, one team alert.
  expect(await keysLike(`balance_reminder:${late.id}`)).toEqual([]);
  expect(await keysLike(`balance_overdue:${late.id}`)).toEqual([
    { dedupe_key: `balance_overdue:${late.id}`, template: "balance_overdue", status: "skipped" },
  ]);
  const [reminder] = await keysLike(`balance_reminder:${soon.id}`);
  expect(reminder).toMatchObject({ template: "balance_reminder", status: "skipped" });

  // A rerun the same day sends nothing new.
  await run();
  expect(await keysLike(`balance_reminder:${soon.id}`)).toHaveLength(1);
  expect(await keysLike(`balance_reminder:${week.id}`)).toHaveLength(1);
  expect(await keysLike(`balance_overdue:${late.id}`)).toHaveLength(1);

  // The overdue booking stays confirmed and shows the derived reason in the attention queue.
  expect((await booking(late.id)).status).toBe("confirmed");
  await signInAs(page, "operator");
  await page.goto("/admin/bookings/attention");
  const item = page.getByRole("list", { name: "Cần xử lý" }).getByRole("listitem").filter({ has: page.getByRole("link", { name: `Mở ${late.code}` }) });
  await expect(item).toContainText("Quá hạn trả phần còn lại");

  // Paying the balance clears it; nothing else to do.
  for (const id of [soon.id, week.id, late.id]) {
    await adminApi().from("bookings").update({ amount_paid: 12_900_000, payment_state: "paid" }).eq("id", id);
  }
  await page.reload();
  await expect(page.getByRole("link", { name: `Mở ${late.code}` })).toHaveCount(0);
});

test("departure checks alert the team once for a departure below its minimum", async ({ request }) => {
  test.skip(!secret, "needs CRON_SECRET (CI)");
  const { data: short, error } = await adminApi().rpc("departures_below_minimum", { within_days: 7 });
  expect(error).toBeNull();
  const departures = short as { departure_id: string; days_left: number }[];
  // The seed has a departure 3 days out with nobody confirmed (TH-CNX-09).
  expect(departures.length).toBeGreaterThan(0);
  const target = departures[0]!;
  for (let i = 0; i < 2; i += 1) {
    const response = await request.get(ROUTES[1]!, { headers: { Authorization: `Bearer ${secret}` } });
    expect(response.status()).toBe(200);
  }
  expect(await keysLike(`min_pax:${target.departure_id}:`)).toEqual([
    { dedupe_key: `min_pax:${target.departure_id}:7d`, template: "min_pax", status: "skipped" },
  ]);
  // Nothing is cancelled automatically.
  const { data: departure } = await adminApi().from("departures").select("status").eq("id", target.departure_id).single();
  expect(departure?.status).not.toBe("cancelled");
});
