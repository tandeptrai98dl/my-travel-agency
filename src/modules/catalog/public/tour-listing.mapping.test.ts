import { describe, expect, it } from "vitest";

import { EMPTY_TOUR_SEARCH } from "../tour-search-params";

import type { DestinationSummary } from "./destination-public.mapping";
import { buildFilterOptions, knownCriteria, searchArgs, totalPages } from "./tour-listing.mapping";

const node = (id: string, key: string, tourCount: number, children: DestinationSummary[] = []): DestinationSummary => ({
  id,
  key,
  type: children.length ? "country" : "city",
  slug: key,
  name: key.toUpperCase(),
  summary: null,
  bestTime: null,
  image: null,
  tourCount,
  children,
});

const index = [
  node("vn", "vietnam", 3, [node("north", "mien-bac", 2, [node("hl", "ha-long-bay", 2)]), node("south", "mien-nam", 0)]),
  node("jp", "japan", 0),
];
const styles = [
  { id: "s1", key: "family", name: "Gia đình" },
  { id: "s2", key: "culture", name: "Văn hoá" },
];

describe("buildFilterOptions", () => {
  const options = buildFilterOptions(index, styles);

  it("keeps only destinations with tours, as a tree", () => {
    expect(options.destinations).toEqual([
      { key: "vietnam", name: "VIETNAM", tourCount: 3, children: [{ key: "mien-bac", name: "MIEN-BAC", tourCount: 2, children: [{ key: "ha-long-bay", name: "HA-LONG-BAY", tourCount: 2, children: [] }] }] },
    ]);
  });

  it("maps a key to its id and every id below it", () => {
    expect(options.destinationIds.vietnam).toEqual(["vn", "north", "hl", "south"]);
    expect(options.destinationIds["ha-long-bay"]).toEqual(["hl"]);
    expect(options.destinationIds.japan).toBeUndefined();
    expect(options.styleIds).toEqual({ family: "s1", culture: "s2" });
    expect(options.styles).toEqual([
      { key: "family", name: "Gia đình" },
      { key: "culture", name: "Văn hoá" },
    ]);
  });
});

describe("search arguments", () => {
  const options = buildFilterOptions(index, styles);

  it("drops keys the filters do not offer", () => {
    const known = knownCriteria({ ...EMPTY_TOUR_SEARCH, dest: ["japan", "nowhere", "vietnam"], style: ["family", "spa"] }, options);
    expect(known.dest).toEqual(["vietnam"]);
    expect(known.style).toEqual(["family"]);
  });

  it("expands destinations to their children, months to first days, pages to offsets", () => {
    const args = searchArgs(
      "vi",
      {
        ...EMPTY_TOUR_SEARCH,
        q: "ha long",
        scopes: ["domestic"],
        dest: ["mien-bac", "vietnam"],
        style: ["culture"],
        priceMin: 30_000_000,
        priceMax: null,
        months: ["2027-03", "2027-04"],
        durations: ["5-8"],
        sort: "price_asc",
        page: 3,
      },
      options,
    );
    expect(args).toEqual({
      locale: "vi",
      q: "ha long",
      scopes: ["domestic"],
      destinationIds: ["north", "hl", "vn", "south"],
      travelStyleIds: ["s2"],
      priceMin: 30_000_000,
      priceMax: undefined,
      months: ["2027-03-01", "2027-04-01"],
      durations: ["5-8"],
      sort: "price_asc",
      limit: 12,
      offset: 24,
    });
  });

  it("leaves filters out when nothing is selected", () => {
    const args = searchArgs("en", EMPTY_TOUR_SEARCH, options);
    expect(args).toMatchObject({ q: undefined, scopes: [], destinationIds: [], travelStyleIds: [], months: [], offset: 0 });
  });

  it("counts pages", () => {
    expect([0, 1, 12, 13, 31].map(totalPages)).toEqual([1, 1, 1, 2, 3]);
  });
});
