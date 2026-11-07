import { describe, expect, it } from "vitest";

import { addDays } from "@/lib/dates";

import { type BalanceCandidate, jobDay, planBalanceJobs, planMinPaxAlerts, reminderWindows, smallestWindow } from "./schedule";

const confirmed = (id: string, due: string | null, paid = 3, total = 10): BalanceCandidate => ({
  id,
  status: "confirmed",
  total,
  amountPaid: paid,
  balanceDueDate: due,
});

describe("smallestWindow", () => {
  it("picks the smallest window that applies", () => {
    expect(smallestWindow(7, [7, 2])).toBe(7);
    expect(smallestWindow(3, [7, 2])).toBe(7);
    expect(smallestWindow(2, [7, 2])).toBe(2);
    expect(smallestWindow(0, [7, 2])).toBe(2);
  });

  it("applies no window before the largest one or after the date", () => {
    expect(smallestWindow(8, [7, 2])).toBeNull();
    expect(smallestWindow(-1, [7, 2])).toBeNull();
    expect(smallestWindow(1.5, [7, 2])).toBeNull();
  });
});

describe("reminderWindows", () => {
  it("reads the setting and falls back to 7 and 2 days", () => {
    expect(reminderWindows([2, 10, 2])).toEqual([10, 2]);
    expect(reminderWindows(undefined)).toEqual([7, 2]);
    expect(reminderWindows([])).toEqual([7, 2]);
    expect(reminderWindows(["7", 0, 61, 3.5])).toEqual([7, 2]);
  });
});

describe("planBalanceJobs", () => {
  const today = "2026-11-10";

  it("sends the 7-day reminder 7 days out and the 2-day one 2 days out", () => {
    const plan = planBalanceJobs([confirmed("a", addDays(today, 7)), confirmed("b", addDays(today, 2))], today, [7, 2], new Set());
    expect(plan.reminders).toEqual([
      { bookingId: "a", window: 7, key: "balance_reminder:a:7d" },
      { bookingId: "b", window: 2, key: "balance_reminder:b:2d" },
    ]);
    expect(plan.overdue).toEqual([]);
  });

  it("catches up after a missed day: 6 days out still gets the 7-day reminder", () => {
    const plan = planBalanceJobs([confirmed("a", addDays(today, 6))], today, [7, 2], new Set());
    expect(plan.reminders.map((r) => r.key)).toEqual(["balance_reminder:a:7d"]);
  });

  it("never sends the 7-day reminder once the 2-day window applies", () => {
    // The 7-day run was missed and the 2-day one comes first: only the 2-day key.
    const plan = planBalanceJobs([confirmed("a", addDays(today, 1))], today, [7, 2], new Set());
    expect(plan.reminders.map((r) => r.key)).toEqual(["balance_reminder:a:2d"]);
  });

  it("sends nothing on a rerun the same day (the key is spent)", () => {
    const plan = planBalanceJobs(
      [confirmed("a", addDays(today, 5)), confirmed("b", addDays(today, -3))],
      today,
      [7, 2],
      new Set(["balance_reminder:a:7d", "balance_overdue:b"]),
    );
    expect(plan).toEqual({ reminders: [], overdue: [] });
  });

  it("alerts the team once for an overdue balance and never sends a reminder for it", () => {
    const plan = planBalanceJobs([confirmed("a", addDays(today, -1))], today, [7, 2], new Set());
    expect(plan).toEqual({ reminders: [], overdue: [{ bookingId: "a", key: "balance_overdue:a" }] });
  });

  it("reminds on the due date itself", () => {
    expect(planBalanceJobs([confirmed("a", today)], today, [7, 2], new Set()).reminders[0]?.key).toBe("balance_reminder:a:2d");
  });

  it("skips paid, unconfirmed and undated bookings and those far away", () => {
    const plan = planBalanceJobs(
      [
        confirmed("paid", addDays(today, 2), 10, 10),
        { ...confirmed("pending", addDays(today, 2)), status: "pending_payment" },
        confirmed("undated", null),
        confirmed("far", addDays(today, 30)),
      ],
      today,
      [7, 2],
      new Set(),
    );
    expect(plan).toEqual({ reminders: [], overdue: [] });
  });
});

describe("Vietnam dates around midnight UTC", () => {
  it("a run at 16:59 UTC is still that day in Vietnam, at 17:00 UTC it is the next day", () => {
    expect(jobDay(new Date("2026-11-09T16:59:59Z"))).toBe("2026-11-09");
    expect(jobDay(new Date("2026-11-09T17:00:00Z"))).toBe("2026-11-10");
  });

  it("the scheduled run (01:43 UTC) is the same Vietnam day as UTC", () => {
    expect(jobDay(new Date("2026-11-10T01:43:00Z"))).toBe("2026-11-10");
  });

  it("the window follows the Vietnam day, not the UTC one", () => {
    const due = "2026-11-12";
    const lateUtc = jobDay(new Date("2026-11-09T18:00:00Z")); // 01:00 on the 10th in Vietnam
    const plan = planBalanceJobs([confirmed("a", due)], lateUtc, [7, 2], new Set());
    // UTC would still say the 9th (3 days left, the 7-day window); Vietnam says 2 days left.
    expect(plan.reminders.map((r) => r.key)).toEqual(["balance_reminder:a:2d"]);
  });
});

describe("planMinPaxAlerts", () => {
  it("alerts at 21, 14 and 7 days, once per bucket, and catches up", () => {
    const alerts = planMinPaxAlerts(
      [
        { departureId: "d21", daysLeft: 21 },
        { departureId: "d15", daysLeft: 15 },
        { departureId: "d14", daysLeft: 14 },
        { departureId: "d3", daysLeft: 3 },
        { departureId: "far", daysLeft: 22 },
        { departureId: "past", daysLeft: -1 },
      ],
      new Set(["min_pax:d14:14d"]),
    );
    expect(alerts.map((a) => a.key)).toEqual(["min_pax:d21:21d", "min_pax:d15:21d", "min_pax:d3:7d"]);
  });
});
