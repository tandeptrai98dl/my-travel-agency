import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  daysBetween,
  isIsoDate,
  isIsoMonth,
  monthBounds,
  monthWeeks,
  todayInVietnam,
  weekday,
} from "./dates";

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2026-12-31")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26-12-31")).toBe(false);
    expect(isIsoDate("2026-12-31T00:00")).toBe(false);
    expect(isIsoMonth("2026-12")).toBe(true);
    expect(isIsoMonth("2026-00")).toBe(false);
  });

  it("uses the Vietnamese business day", () => {
    // 18:30 UTC on 31 December is already 1 January in Vietnam (UTC+7).
    expect(todayInVietnam(new Date("2026-12-31T18:30:00Z"))).toBe("2027-01-01");
    expect(todayInVietnam(new Date("2026-12-31T16:00:00Z"))).toBe("2026-12-31");
  });

  it("does day arithmetic across months, years and leap days", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
    expect(daysBetween("2026-02-01", "2026-01-31")).toBe(-1);
    expect(weekday("2026-11-09")).toBe(1); // a Monday
  });

  it("builds month bounds and steps months", () => {
    expect(monthBounds("2028-02")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("lays a month out in Monday-first weeks", () => {
    // November 2026 starts on a Sunday: six empty cells before it.
    const weeks = monthWeeks("2026-11");
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.at(-1)?.[0]).toBe("2026-11-30");
  });
});
