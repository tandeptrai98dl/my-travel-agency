/**
 * Tour listing search state <-> URL (docs/specs/tour-listing.md §4.1). The URL is the only source
 * of truth: parsing never throws (invalid values are dropped and defaults used) and serialising
 * writes a fixed parameter order with sorted list values and no defaults, so one search always
 * maps to one URL.
 *
 * Plain TypeScript without Zod: the filter panel serialises in the browser, and Zod would add to
 * the initial JavaScript of the page (ADR-029).
 */

export const TOUR_PAGE_SIZE = 12;

export const TOUR_SORTS = ["recommended", "price_asc", "price_desc", "duration_asc", "departure_asc"] as const;
export type TourSort = (typeof TOUR_SORTS)[number];
export const DEFAULT_TOUR_SORT: TourSort = "recommended";

export const TOUR_DURATIONS = ["1-4", "5-8", "9-14", "15-plus"] as const;
export type TourDuration = (typeof TOUR_DURATIONS)[number];

export const TOUR_SCOPES = ["domestic", "international"] as const;
export type TourScope = (typeof TOUR_SCOPES)[number];

/** Price bounds accepted in the URL (VND per adult). */
export const TOUR_PRICE_LIMIT = 10_000_000_000;

/** Price presets offered by the filter (VND per adult; tour-listing.md L4); open ends are null. */
export const TOUR_PRICE_PRESETS: readonly { min: number | null; max: number | null }[] = [
  { min: null, max: 30_000_000 },
  { min: 30_000_000, max: 60_000_000 },
  { min: 60_000_000, max: 100_000_000 },
  { min: 100_000_000, max: 200_000_000 },
  { min: 200_000_000, max: null },
];

export const TOUR_QUERY_MIN = 2;
export const TOUR_QUERY_MAX = 100;
const MAX_KEYS = 10;
const MAX_MONTHS = 12;
const MAX_PAGE = 1000;

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const INTEGER = /^\d{1,11}$/;

export type TourSearchCriteria = {
  q: string | null;
  scopes: TourScope[];
  dest: string[];
  style: string[];
  priceMin: number | null;
  priceMax: number | null;
  months: string[];
  durations: TourDuration[];
  sort: TourSort;
  page: number;
};

export const EMPTY_TOUR_SEARCH: TourSearchCriteria = {
  q: null,
  scopes: [],
  dest: [],
  style: [],
  priceMin: null,
  priceMax: null,
  months: [],
  durations: [],
  sort: DEFAULT_TOUR_SORT,
  page: 1,
};

export type SearchParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

export type ParseOptions = {
  /** Months that may be selected (the next 12); other months are dropped. Format-only when absent. */
  months?: readonly string[];
};

function valuesOf(input: SearchParamsInput, name: string): string[] {
  if (input instanceof URLSearchParams) return input.getAll(name);
  const value = input[name];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Comma-separated and repeated values, trimmed, deduplicated and sorted. */
function listOf(input: SearchParamsInput, name: string): string[] {
  const out = new Set<string>();
  for (const raw of valuesOf(input, name)) {
    for (const part of raw.split(",")) {
      const value = part.trim();
      if (value) out.add(value);
    }
  }
  return [...out].sort();
}

function oneOf<T extends string>(allowed: readonly T[], values: string[]): T[] {
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value));
}

/** The search term: whitespace collapsed, 2–100 characters, otherwise none. */
export function normalizeQuery(raw: string | null | undefined): string | null {
  const value = (raw ?? "").replace(/\s+/g, " ").trim();
  return value.length >= TOUR_QUERY_MIN && value.length <= TOUR_QUERY_MAX ? value : null;
}

/** A whole number of dong; thousands separators typed into the filter's inputs are accepted. */
function amount(raw: string | undefined): number | null {
  const value = raw?.trim().replace(/[.,\s]/g, "");
  if (!value || !INTEGER.test(value)) return null;
  const number = Number(value);
  return number <= TOUR_PRICE_LIMIT ? number : null;
}

function price(input: SearchParamsInput, name: string): number | null {
  return amount(valuesOf(input, name)[0]);
}

/** A preset sent by the filter form without JavaScript (`price=30000000-60000000`, open ends empty). */
export function presetValue(preset: { min: number | null; max: number | null }): string {
  return `${preset.min ?? ""}-${preset.max ?? ""}`;
}

export function parseTourSearchParams(input: SearchParamsInput, options: ParseOptions = {}): TourSearchCriteria {
  let priceMin = price(input, "price_min");
  let priceMax = price(input, "price_max");
  // The preset radio counts only when no custom amount was typed (the custom inputs win).
  const preset = valuesOf(input, "price")[0];
  if (priceMin === null && priceMax === null && preset && /^\d*-\d*$/.test(preset)) {
    const [min, max] = preset.split("-");
    priceMin = amount(min);
    priceMax = amount(max);
  }
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];
  if (priceMin === 0) priceMin = null;

  const sortValue = valuesOf(input, "sort")[0];
  const pageValue = valuesOf(input, "page")[0]?.trim() ?? "";
  const page = /^\d{1,4}$/.test(pageValue) ? Number(pageValue) : 1;

  return {
    q: normalizeQuery(valuesOf(input, "q")[0]),
    scopes: oneOf(TOUR_SCOPES, listOf(input, "scope")),
    dest: listOf(input, "dest").filter((key) => KEY.test(key) && key.length <= 60).slice(0, MAX_KEYS),
    style: listOf(input, "style").filter((key) => KEY.test(key) && key.length <= 60).slice(0, MAX_KEYS),
    priceMin,
    priceMax,
    months: listOf(input, "month")
      .filter((month) => MONTH.test(month) && (!options.months || options.months.includes(month)))
      .slice(0, MAX_MONTHS),
    durations: oneOf(TOUR_DURATIONS, listOf(input, "duration")),
    sort: (TOUR_SORTS as readonly string[]).includes(sortValue ?? "") ? (sortValue as TourSort) : DEFAULT_TOUR_SORT,
    page: page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

/** The query string (without `?`) for some criteria; empty for the default search. */
export function serializeTourSearchParams(criteria: Partial<TourSearchCriteria>): string {
  const c = { ...EMPTY_TOUR_SEARCH, ...criteria };
  const list = (values: readonly string[]) => [...new Set(values)].sort().map(encode).join(",");
  const parts: string[] = [];
  const q = normalizeQuery(c.q);
  if (q) parts.push(`q=${encode(q)}`);
  if (c.scopes.length) parts.push(`scope=${list(c.scopes)}`);
  if (c.dest.length) parts.push(`dest=${list(c.dest)}`);
  if (c.style.length) parts.push(`style=${list(c.style)}`);
  let [min, max] = [c.priceMin, c.priceMax];
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  if (min !== null && min > 0) parts.push(`price_min=${min}`);
  if (max !== null) parts.push(`price_max=${max}`);
  if (c.months.length) parts.push(`month=${list(c.months)}`);
  if (c.durations.length) parts.push(`duration=${list(c.durations)}`);
  if (c.sort !== DEFAULT_TOUR_SORT) parts.push(`sort=${c.sort}`);
  if (c.page > 1) parts.push(`page=${c.page}`);
  return parts.join("&");
}

/** Criteria with one change applied; any change other than the page goes back to page 1. */
export function withChange(criteria: TourSearchCriteria, change: Partial<TourSearchCriteria>): TourSearchCriteria {
  return { ...criteria, page: 1, ...change };
}

/** Number of active filters (search and sort not counted), for the "Filters (n)" button. */
export function countActiveFilters(c: TourSearchCriteria): number {
  return (
    c.scopes.length +
    c.dest.length +
    c.style.length +
    (c.priceMin !== null || c.priceMax !== null ? 1 : 0) +
    c.months.length +
    c.durations.length
  );
}

/** Whether a search narrows or reorders the default listing (noindex, canonical to /tours). */
export function isFilteredSearch(c: TourSearchCriteria): boolean {
  return countActiveFilters(c) > 0 || c.q !== null || c.sort !== DEFAULT_TOUR_SORT;
}
