import { describe, expect, it } from "vitest";

import { expandPlan, MAX_DEPARTURES_PER_PLAN, parseDate, parseDateList } from "./departure-dates";

describe("bulk departure dates", () => {
  it("reads ISO and day-first Vietnamese dates", () => {
    expect(parseDate("2026-12-24")).toBe("2026-12-24");
    expect(parseDate("24/12/2026")).toBe("2026-12-24");
    expect(parseDate("4.1.2027")).toBe("2027-01-04");
    expect(parseDate("31/02/2027")).toBeNull();
    expect(parseDate("12/24/2026")).toBeNull();
    expect(parseDate("tomorrow")).toBeNull();
  });

  it("parses a pasted list, sorted, without repeats, and reports what it cannot read", () => {
    expect(parseDateList("24/12/2026\n2026-12-05, 05/12/2026;  2027-01-02")).toEqual({
      dates: ["2026-12-05", "2026-12-24", "2027-01-02"],
      invalid: [],
    });
    expect(parseDateList("2026-12-05 32/12/2026 soon").invalid).toEqual(["32/12/2026", "soon"]);
  });

  it("expands a weekday pattern within a range, both ends included", () => {
    // Saturdays (6) and Wednesdays (3) from Sat 5 Dec to Sat 19 Dec 2026.
    expect(expandPlan({ mode: "weekly", from: "2026-12-05", to: "2026-12-19", weekdays: [6, 3] })).toEqual({
      ok: true,
      dates: ["2026-12-05", "2026-12-09", "2026-12-12", "2026-12-16", "2026-12-19"],
    });
  });

  it("refuses incomplete or impossible ranges", () => {
    const weekly = { mode: "weekly" as const, from: "2026-12-05", to: "2026-12-19", weekdays: [6] };
    expect(expandPlan({ ...weekly, from: "" })).toMatchObject({ ok: false, error: "required", field: "from" });
    expect(expandPlan({ ...weekly, to: "2026-13-01" })).toMatchObject({ ok: false, error: "dateInvalid", field: "to" });
    expect(expandPlan({ ...weekly, to: "2026-12-01" })).toMatchObject({ ok: false, error: "toBeforeFrom", field: "to" });
    expect(expandPlan({ ...weekly, to: "2029-12-19" })).toMatchObject({ ok: false, error: "rangeTooLong", field: "to" });
    expect(expandPlan({ ...weekly, weekdays: [] })).toMatchObject({ ok: false, error: "weekdaysRequired" });
    // A Monday-only pattern over a Saturday-to-Sunday range matches nothing.
    expect(expandPlan({ ...weekly, to: "2026-12-06", weekdays: [1] })).toMatchObject({ ok: false, error: "noDates" });
  });

  it("refuses dates in the past only when today is known", () => {
    const plan = { mode: "dates" as const, dates: "2026-11-01\n2026-12-01" };
    expect(expandPlan(plan).ok).toBe(true);
    expect(expandPlan(plan, "2026-11-07")).toMatchObject({ ok: false, error: "pastDate", invalid: ["2026-11-01"] });
    expect(expandPlan({ mode: "weekly", from: "2026-11-01", to: "2026-12-01", weekdays: [0] }, "2026-11-07")).toMatchObject({
      ok: false,
      error: "pastDate",
      field: "from",
    });
    // Today itself is allowed.
    expect(expandPlan({ mode: "dates", dates: "2026-11-07" }, "2026-11-07").ok).toBe(true);
  });

  it("caps one plan", () => {
    const daily = { mode: "weekly" as const, from: "2027-01-01", to: "2027-12-31", weekdays: [0, 1, 2, 3, 4, 5, 6] };
    expect(expandPlan(daily)).toMatchObject({ ok: false, error: "tooManyDates" });
    const weekly = expandPlan({ ...daily, weekdays: [6] });
    expect(weekly.ok && weekly.dates.length).toBe(52);
    expect(MAX_DEPARTURES_PER_PLAN).toBeGreaterThanOrEqual(52 * 2);
    expect(expandPlan({ mode: "dates", dates: "x 2027-01-01" })).toMatchObject({ ok: false, error: "datesInvalid", invalid: ["x"] });
    expect(expandPlan({ mode: "dates", dates: "  " })).toMatchObject({ ok: false, error: "required" });
  });
});
