import { describe, expect, it } from "vitest";

import {
  EMPTY_TOUR_SEARCH,
  countActiveFilters,
  isFilteredSearch,
  normalizeQuery,
  parseTourSearchParams,
  serializeTourSearchParams,
  withChange,
} from "./tour-search-params";

describe("parseTourSearchParams", () => {
  it("returns the defaults for an empty URL", () => {
    expect(parseTourSearchParams({})).toEqual(EMPTY_TOUR_SEARCH);
    expect(parseTourSearchParams(new URLSearchParams())).toEqual(EMPTY_TOUR_SEARCH);
  });

  it("reads every parameter", () => {
    const criteria = parseTourSearchParams(
      new URLSearchParams(
        "q=ha+long&scope=international,domestic&dest=vietnam&style=family&price_min=30000000&price_max=60000000&month=2027-03&duration=5-8&sort=price_asc&page=2",
      ),
    );
    expect(criteria).toEqual({
      q: "ha long",
      scopes: ["domestic", "international"],
      dest: ["vietnam"],
      style: ["family"],
      priceMin: 30_000_000,
      priceMax: 60_000_000,
      months: ["2027-03"],
      durations: ["5-8"],
      sort: "price_asc",
      page: 2,
    });
  });

  it("accepts repeated and comma-separated values, deduplicated and sorted", () => {
    const criteria = parseTourSearchParams({ dest: ["japan,vietnam", "france", "japan"], duration: ["9-14", "1-4"] });
    expect(criteria.dest).toEqual(["france", "japan", "vietnam"]);
    expect(criteria.durations).toEqual(["1-4", "9-14"]);
  });

  it("drops invalid values silently", () => {
    const criteria = parseTourSearchParams({
      q: "a",
      scope: "space,domestic",
      dest: "Viet Nam,ha-long-bay,-x,a--b",
      price_min: "-5",
      price_max: "1e9",
      month: "2027-13,2027-1,abcd-01,2027-04",
      duration: "3-5",
      sort: "cheapest",
      page: "0",
    });
    expect(criteria).toEqual({
      ...EMPTY_TOUR_SEARCH,
      scopes: ["domestic"],
      dest: ["ha-long-bay"],
      months: ["2027-04"],
    });
  });

  it("keeps only months in the allowed window when given", () => {
    const criteria = parseTourSearchParams({ month: "2026-01,2027-03,2030-01" }, { months: ["2027-02", "2027-03"] });
    expect(criteria.months).toEqual(["2027-03"]);
  });

  it("swaps min and max, ignores a zero minimum and refuses amounts over 10 billion", () => {
    expect(parseTourSearchParams({ price_min: "90000000", price_max: "30000000" })).toMatchObject({
      priceMin: 30_000_000,
      priceMax: 90_000_000,
    });
    expect(parseTourSearchParams({ price_min: "0", price_max: "10000000000" })).toMatchObject({
      priceMin: null,
      priceMax: 10_000_000_000,
    });
    expect(parseTourSearchParams({ price_max: "10000000001" }).priceMax).toBeNull();
  });

  it("limits keys and months", () => {
    const keys = Array.from({ length: 14 }, (_, index) => `k${String(index).padStart(2, "0")}`);
    expect(parseTourSearchParams({ dest: keys.join(",") }).dest).toHaveLength(10);
  });

  it("uses the first value of single parameters and refuses huge pages", () => {
    expect(parseTourSearchParams({ sort: ["duration_asc", "price_asc"], page: ["3", "4"] })).toMatchObject({
      sort: "duration_asc",
      page: 3,
    });
    expect(parseTourSearchParams({ page: "99999" }).page).toBe(1);
    expect(parseTourSearchParams({ page: "2.5" }).page).toBe(1);
  });
});

describe("normalizeQuery", () => {
  it("collapses whitespace and enforces 2–100 characters", () => {
    expect(normalizeQuery("  ha   long ")).toBe("ha long");
    expect(normalizeQuery(" a ")).toBeNull();
    expect(normalizeQuery("x".repeat(101))).toBeNull();
    expect(normalizeQuery("x".repeat(100))).toHaveLength(100);
    expect(normalizeQuery(undefined)).toBeNull();
  });
});

describe("serializeTourSearchParams", () => {
  it("writes nothing for the default search", () => {
    expect(serializeTourSearchParams(EMPTY_TOUR_SEARCH)).toBe("");
    expect(serializeTourSearchParams({})).toBe("");
  });

  it("writes a fixed order with sorted lists and no defaults", () => {
    expect(
      serializeTourSearchParams({
        page: 3,
        sort: "departure_asc",
        durations: ["9-14", "1-4"],
        months: ["2027-04", "2027-03"],
        priceMax: 60_000_000,
        priceMin: 30_000_000,
        style: ["family"],
        dest: ["vietnam", "japan"],
        scopes: ["international"],
        q: "Hạ Long, Việt Nam",
      }),
    ).toBe(
      "q=H%E1%BA%A1+Long%2C+Vi%E1%BB%87t+Nam&scope=international&dest=japan,vietnam&style=family&price_min=30000000&price_max=60000000&month=2027-03,2027-04&duration=1-4,9-14&sort=departure_asc&page=3",
    );
  });

  it("round-trips: parsing its output gives the same criteria and the same URL", () => {
    const original = parseTourSearchParams({
      q: "đà lạt",
      dest: "vietnam,france",
      price_min: "120000000",
      month: "2027-05",
      sort: "price_desc",
      page: "2",
    });
    const url = serializeTourSearchParams(original);
    const again = parseTourSearchParams(new URLSearchParams(url));
    expect(again).toEqual(original);
    expect(serializeTourSearchParams(again)).toBe(url);
  });

  it("maps equivalent URLs to one URL", () => {
    const a = serializeTourSearchParams(parseTourSearchParams(new URLSearchParams("dest=b&dest=a&sort=recommended&page=1")));
    const b = serializeTourSearchParams(parseTourSearchParams(new URLSearchParams("dest=a,b,a")));
    expect(a).toBe("dest=a,b");
    expect(b).toBe(a);
  });

  it("swaps a reversed price range", () => {
    expect(serializeTourSearchParams({ priceMin: 9, priceMax: 3 })).toBe("price_min=3&price_max=9");
  });
});

describe("helpers", () => {
  it("withChange resets the page unless the page is the change", () => {
    const base = { ...EMPTY_TOUR_SEARCH, page: 4 };
    expect(withChange(base, { sort: "price_asc" }).page).toBe(1);
    expect(withChange(base, { page: 5 }).page).toBe(5);
  });

  it("counts filters and tells filtered searches apart", () => {
    const filtered = { ...EMPTY_TOUR_SEARCH, dest: ["a", "b"], priceMax: 5, durations: ["1-4" as const] };
    expect(countActiveFilters(filtered)).toBe(4);
    expect(isFilteredSearch(EMPTY_TOUR_SEARCH)).toBe(false);
    expect(isFilteredSearch({ ...EMPTY_TOUR_SEARCH, page: 3 })).toBe(false);
    expect(isFilteredSearch({ ...EMPTY_TOUR_SEARCH, q: "kyoto" })).toBe(true);
    expect(isFilteredSearch({ ...EMPTY_TOUR_SEARCH, sort: "price_asc" })).toBe(true);
    expect(isFilteredSearch(filtered)).toBe(true);
  });
});
