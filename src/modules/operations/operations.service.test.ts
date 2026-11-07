import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  balanceCandidates: vi.fn(),
  claimedKeys: vi.fn(),
  bookingRules: vi.fn(),
  departuresBelowMinimum: vi.fn(),
  tourTitles: vi.fn(),
  sendBalanceReminder: vi.fn(),
  sendBalanceOverdueAlert: vi.fn(),
  sendMinPaxAlert: vi.fn(),
}));
vi.mock("./operations.repository", () => ({
  balanceCandidates: mocks.balanceCandidates,
  claimedKeys: mocks.claimedKeys,
  bookingRules: mocks.bookingRules,
  departuresBelowMinimum: mocks.departuresBelowMinimum,
  tourTitles: mocks.tourTitles,
}));
vi.mock("@/modules/booking/booking-emails.service", () => ({
  sendBalanceReminder: mocks.sendBalanceReminder,
  sendBalanceOverdueAlert: mocks.sendBalanceOverdueAlert,
  sendMinPaxAlert: mocks.sendMinPaxAlert,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { runBalanceReminders, runDepartureChecks } from "./operations.service";

// 01:43 UTC on 10 November: 08:43 in Vietnam.
const NOW = new Date("2026-11-10T01:43:00Z");
const row = (id: string, due: string, paid = 3, total = 10) => ({ id, status: "confirmed", total, amount_paid: paid, balance_due_date: due });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bookingRules.mockResolvedValue({ data: { value: { balance_reminder_days_before_due: [7, 2] } }, error: null });
  mocks.claimedKeys.mockResolvedValue({ data: [], error: null });
  mocks.sendBalanceReminder.mockResolvedValue("unavailable");
  mocks.sendBalanceOverdueAlert.mockResolvedValue("unavailable");
  mocks.sendMinPaxAlert.mockResolvedValue("unavailable");
  mocks.tourTitles.mockResolvedValue({ data: [{ tour_id: "t1", locale: "vi", title: "Vịnh Hạ Long" }], error: null });
});

describe("runBalanceReminders", () => {
  it("reads due dates up to the largest window, sends each unclaimed key once and reports counts", async () => {
    mocks.balanceCandidates.mockResolvedValue({
      data: [row("a", "2026-11-17"), row("b", "2026-11-11"), row("c", "2026-11-09"), row("paid", "2026-11-12", 10, 10)],
      error: null,
    });
    mocks.claimedKeys.mockResolvedValue({ data: [{ dedupe_key: "balance_reminder:b:2d" }], error: null });
    const result = await runBalanceReminders(NOW);
    expect(mocks.balanceCandidates).toHaveBeenCalledWith("2026-11-17", 0, 499);
    expect(mocks.claimedKeys).toHaveBeenCalledWith(["balance_reminder:a:7d", "balance_reminder:b:2d", "balance_overdue:c"]);
    expect(mocks.sendBalanceReminder.mock.calls).toEqual([["a", "balance_reminder:a:7d"]]);
    expect(mocks.sendBalanceOverdueAlert.mock.calls).toEqual([["c", "balance_overdue:c"]]);
    expect(result).toEqual({
      reminders: { considered: 2, sent: 0, skipped: 1, failed: 0, duplicate: 1 },
      overdue: { considered: 1, sent: 0, skipped: 1, failed: 0, duplicate: 0 },
    });
  });

  it("uses the configured windows", async () => {
    mocks.bookingRules.mockResolvedValue({ data: { value: { balance_reminder_days_before_due: [10] } }, error: null });
    mocks.balanceCandidates.mockResolvedValue({ data: [row("a", "2026-11-15")], error: null });
    await runBalanceReminders(NOW);
    expect(mocks.balanceCandidates).toHaveBeenCalledWith("2026-11-20", 0, 499);
    expect(mocks.sendBalanceReminder).toHaveBeenCalledWith("a", "balance_reminder:a:10d");
  });

  it("fails without sending when a read fails", async () => {
    mocks.balanceCandidates.mockResolvedValue({ data: null, error: { code: "57014" } });
    await expect(runBalanceReminders(NOW)).rejects.toThrow("57014");
    expect(mocks.sendBalanceReminder).not.toHaveBeenCalled();
  });
});

describe("runDepartureChecks", () => {
  it("alerts each departure once per bucket with Vietnamese facts", async () => {
    mocks.departuresBelowMinimum.mockResolvedValue({
      data: [
        { departure_id: "d1", tour_id: "t1", tour_code: "VN-HLB-03", start_date: "2026-11-15", days_left: 5, confirmed: 2, min_pax: 8 },
        { departure_id: "d2", tour_id: "t1", tour_code: "VN-HLB-03", start_date: "2026-11-24", days_left: 14, confirmed: 0, min_pax: 8 },
      ],
      error: null,
    });
    mocks.claimedKeys.mockResolvedValue({ data: [{ dedupe_key: "min_pax:d2:14d" }], error: null });
    mocks.sendMinPaxAlert.mockResolvedValue("sent");
    const result = await runDepartureChecks();
    expect(mocks.departuresBelowMinimum).toHaveBeenCalledWith(21);
    expect(mocks.sendMinPaxAlert.mock.calls).toEqual([
      ["d1", { tourCode: "VN-HLB-03", tourTitle: "Vịnh Hạ Long", startDate: "15/11/2026", daysLeft: 5, confirmed: 2, minPax: 8 }, "min_pax:d1:7d"],
    ]);
    expect(result.alerts).toEqual({ considered: 2, sent: 1, skipped: 0, failed: 0, duplicate: 1 });
  });

  it("refuses an answer of the wrong shape", async () => {
    mocks.departuresBelowMinimum.mockResolvedValue({ data: [{ departure_id: 1 }], error: null });
    await expect(runDepartureChecks()).rejects.toThrow();
    expect(mocks.sendMinPaxAlert).not.toHaveBeenCalled();
  });
});
