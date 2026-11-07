import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { DESTINATIONS_TAG, TOURS_TAG, TRAVEL_STYLES_TAG } from "../cache-tags";
import { TOUR_PAGE_SIZE, type TourSearchCriteria } from "../tour-search-params";

import * as destinationRepo from "./destination-public.repository";
import { getDestinationIndex } from "./destination-public.service";
import { buildFilterOptions, knownCriteria, searchArgs, totalPages, type TourFilterOptions } from "./tour-listing.mapping";
import * as repo from "./tour-public.repository";
import { cardsFor } from "./tour-public.service";
import type { Locale, TourCardItem } from "./types";

/** Tour listing reads (docs/specs/tour-listing.md §4.2–4.3). */

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what} failed: ${error.message}`);
}

/**
 * Destinations with tours and the published travel styles of one language, for the filters
 * (cached; tags `tours`, `destinations`, `travel-styles`). Errors throw to the listing's error
 * state: without the options the filters could not be read back from the URL.
 */
export async function getTourFilterOptions(locale: Locale): Promise<TourFilterOptions> {
  "use cache";
  cacheTag(TOURS_TAG, DESTINATIONS_TAG, TRAVEL_STYLES_TAG);
  cacheLife("hours");
  const [index, styles] = await Promise.all([getDestinationIndex(locale), destinationRepo.findTravelStyleRows(locale)]);
  if (styles.error) fail("travel styles", styles.error);
  return buildFilterOptions(
    index,
    (styles.data ?? []).flatMap((row) => {
      const translation = row.travel_style_translations[0];
      return translation ? [{ id: row.id, key: row.key, name: translation.name }] : [];
    }),
  );
}

export type TourListing =
  | {
      kind: "page";
      /** The search with unknown keys dropped (what the chips and the canonical URL show). */
      criteria: TourSearchCriteria;
      items: TourCardItem[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }
  /** A page past the last one: the route redirects there (307, §1.6). */
  | { kind: "outOfRange"; criteria: TourSearchCriteria; lastPage: number };

/**
 * One page of the listing, live (never cached: prices and seats change with bookings). Errors
 * throw to `error.tsx`; a statement timeout surfaces the same way.
 */
export async function searchTourListing(locale: Locale, criteria: TourSearchCriteria, options: TourFilterOptions): Promise<TourListing> {
  const known = knownCriteria(criteria, options);
  const { data, error } = await repo.searchTours(searchArgs(locale, known, options));
  if (error) fail("tour search", error);
  const rows = data ?? [];

  if (rows.length === 0 && known.page > 1) {
    const first = await repo.searchTours({ ...searchArgs(locale, { ...known, page: 1 }, options), limit: 1 });
    if (first.error) fail("tour search", first.error);
    // No results at all: page 1 shows the empty state.
    return { kind: "outOfRange", criteria: known, lastPage: totalPages(first.data?.[0]?.total_count ?? 0) };
  }

  const total = rows[0]?.total_count ?? 0;
  return {
    kind: "page",
    criteria: known,
    items: await cardsFor(locale, rows),
    total,
    page: known.page,
    pageSize: TOUR_PAGE_SIZE,
    totalPages: totalPages(total),
  };
}
