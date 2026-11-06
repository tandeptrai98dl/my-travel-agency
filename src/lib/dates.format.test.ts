import { describe, expect, it } from "vitest";

import { formatDate, formatDateRange, formatMonth, upcomingMonths } from "./dates";

describe("formatDate", () => {
  it("formats calendar dates per language without time zone shifts", () => {
    expect(formatDate("2026-11-21", "vi")).toBe("21/11/2026");
    expect(formatDate("2026-11-21", "en")).toBe("21 Nov 2026");
    expect(formatDate("2027-01-01", "vi")).toBe("01/01/2027");
  });
});

describe("formatDateRange", () => {
  it("writes the year once when both dates share it", () => {
    expect(formatDateRange("2026-11-21", "2026-11-23", "vi")).toBe("21/11 – 23/11/2026");
    expect(formatDateRange("2026-11-21", "2026-11-23", "en")).toBe("21 – 23 Nov 2026");
    expect(formatDateRange("2026-11-30", "2026-12-02", "en")).toBe("30 Nov – 2 Dec 2026");
  });

  it("keeps both years across a new year, and one date for a day trip", () => {
    expect(formatDateRange("2026-12-30", "2027-01-01", "vi")).toBe("30/12/2026 – 01/01/2027");
    expect(formatDateRange("2026-11-21", "2026-11-21", "en")).toBe("21 Nov 2026");
  });
});

describe("months", () => {
  it("formats a month in both languages", () => {
    expect(formatMonth("2026-12", "vi")).toBe("Tháng 12/2026");
    expect(formatMonth("2027-03", "en")).toBe("March 2027");
  });

  it("lists upcoming months from the current month in Vietnam", () => {
    // 31 Dec 2026, 20:00 UTC is already 1 Jan 2027 in Vietnam.
    expect(upcomingMonths(3, new Date("2026-12-31T20:00:00Z"))).toEqual(["2027-01", "2027-02", "2027-03"]);
  });
});
