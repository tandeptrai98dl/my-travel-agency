import { describe, expect, it } from "vitest";

import { formatDate, formatDateRange } from "./dates";

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
