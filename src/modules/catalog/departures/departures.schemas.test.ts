import { describe, expect, it } from "vitest";

import { departureFilters, departurePlanSchema, departureView, monthSteps, monthWindow } from "./departures.schemas";

describe("departure list params", () => {
  it("keeps only a known status, a tour id and a real month", () => {
    expect(
      departureFilters({ status: "guaranteed", tour: "0f8fad5b-d9cb-469f-a165-70867728950e", month: "2026-12" }),
    ).toEqual({ status: "guaranteed", tourId: "0f8fad5b-d9cb-469f-a165-70867728950e", month: "2026-12" });
    expect(departureFilters({ status: "sold", tour: "VN-HLB-03", month: "2026-13" })).toEqual({});
  });

  it("falls back to the table view", () => {
    expect(departureView("calendar")).toBe("calendar");
    expect(departureView(["calendar", "table"])).toBe("calendar");
    expect(departureView("grid")).toBe("table");
    expect(departureView(undefined)).toBe("table");
  });
});

describe("departure plan schema", () => {
  const base = {
    tourId: "0f8fad5b-d9cb-469f-a165-70867728950e",
    mode: "weekly",
    from: "2026-12-05",
    to: "2026-12-19",
    weekdays: [6],
    dates: "",
    capacity: 16,
    status: "open",
    note: "",
    prices: null,
  };

  it("accepts a plan and parses its own output again", () => {
    const parsed = departurePlanSchema.parse(base);
    expect(parsed.note).toBeNull();
    expect(departurePlanSchema.parse(parsed)).toEqual(parsed);
  });

  it("puts date problems on the field that has them", () => {
    const issue = (input: Record<string, unknown>) => departurePlanSchema.safeParse({ ...base, ...input }).error?.issues[0];
    expect(issue({ weekdays: [] })).toMatchObject({ path: ["weekdays"], message: "weekdaysRequired" });
    expect(issue({ to: "2026-12-01" })).toMatchObject({ path: ["to"], message: "toBeforeFrom" });
    expect(issue({ mode: "dates", dates: "soon" })).toMatchObject({ path: ["dates"], message: "datesInvalid" });
  });

  it("refuses an empty capacity, a cancelled start and an adult price left empty", () => {
    const issues = (input: Record<string, unknown>) =>
      departurePlanSchema.safeParse({ ...base, ...input }).error?.issues.map((i) => `${i.path.join(".")}:${i.message}`);
    expect(issues({ capacity: Number.NaN })).toEqual(["capacity:wholeNumber"]);
    expect(issues({ capacity: 0 })).toEqual(["capacity:outOfRange"]);
    expect(issues({ status: "cancelled" })?.[0]).toMatch(/^status:/);
    expect(
      issues({ prices: { priceAdult: Number.NaN, priceChild: null, priceInfant: null, singleSupplement: null } }),
    ).toEqual(["prices.priceAdult:required"]);
  });
});

describe("calendar month window", () => {
  it("offers a year back and a year and a half ahead", () => {
    const window = monthWindow("2026-11");
    expect(window[0]).toBe("2025-11");
    expect(window.at(-1)).toBe("2028-05");
    expect(window).toHaveLength(31);
  });

  it("stops the previous and next links at the ends of the window", () => {
    expect(monthSteps("2026-11", "2026-11")).toEqual({ previous: "2026-10", next: "2026-12" });
    expect(monthSteps("2025-11", "2026-11")).toEqual({ previous: null, next: "2025-12" });
    expect(monthSteps("2028-05", "2026-11")).toEqual({ previous: "2028-04", next: null });
    // A month typed into the URL far outside the window gets neither link.
    expect(monthSteps("2030-01", "2026-11")).toEqual({ previous: null, next: null });
  });
});
