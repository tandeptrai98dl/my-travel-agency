import { describe, expect, it } from "vitest";

import { departureFilters, departureView } from "./departures.schemas";

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
