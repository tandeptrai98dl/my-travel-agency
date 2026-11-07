import { TOUR_PAGE_SIZE, type TourSearchCriteria } from "../tour-search-params";

import type { DestinationSummary } from "./destination-public.mapping";
import type { SearchToursArgs } from "./tour-public.repository";
import type { Locale } from "./types";

/** Pure parts of the tour listing (docs/specs/tour-listing.md §4; unit-tested, no I/O). */

export type FilterDestination = { key: string; name: string; tourCount: number; children: FilterDestination[] };
export type FilterStyle = { key: string; name: string };

export type TourFilterOptions = {
  /** Published destinations with at least one tour in this language, as a tree. */
  destinations: FilterDestination[];
  styles: FilterStyle[];
  /** Destination key → its id and the ids of every destination below it. */
  destinationIds: Record<string, string[]>;
  styleIds: Record<string, string>;
};

/** The filter tree and key maps from the destination index (destinations without tours left out). */
export function buildFilterOptions(index: DestinationSummary[], styles: { id: string; key: string; name: string }[]): TourFilterOptions {
  const destinationIds: Record<string, string[]> = {};
  const walk = (nodes: DestinationSummary[]): FilterDestination[] =>
    nodes.flatMap((node) => {
      if (node.tourCount === 0) return [];
      const ids = (n: DestinationSummary): string[] => [n.id, ...n.children.flatMap(ids)];
      destinationIds[node.key] = ids(node);
      return [{ key: node.key, name: node.name, tourCount: node.tourCount, children: walk(node.children) }];
    });
  const destinations = walk(index);
  return {
    destinations,
    styles: styles.map(({ key, name }) => ({ key, name })),
    destinationIds,
    styleIds: Object.fromEntries(styles.map((style) => [style.key, style.id])),
  };
}

/**
 * Drops keys the options do not offer (unknown, unpublished or without tours in this language),
 * so the page, its chips and its canonical URL show only filters that apply.
 */
export function knownCriteria(criteria: TourSearchCriteria, options: TourFilterOptions): TourSearchCriteria {
  return {
    ...criteria,
    dest: criteria.dest.filter((key) => key in options.destinationIds),
    style: criteria.style.filter((key) => key in options.styleIds),
  };
}

/** `search_tours` arguments for one page of a (known) search. */
export function searchArgs(locale: Locale, criteria: TourSearchCriteria, options: TourFilterOptions): SearchToursArgs {
  const destinationIds = [...new Set(criteria.dest.flatMap((key) => options.destinationIds[key] ?? []))];
  return {
    locale,
    q: criteria.q ?? undefined,
    scopes: criteria.scopes,
    destinationIds,
    travelStyleIds: criteria.style.flatMap((key) => (options.styleIds[key] ? [options.styleIds[key]] : [])),
    priceMin: criteria.priceMin ?? undefined,
    priceMax: criteria.priceMax ?? undefined,
    months: criteria.months.map((month) => `${month}-01`),
    durations: criteria.durations,
    sort: criteria.sort,
    limit: TOUR_PAGE_SIZE,
    offset: (criteria.page - 1) * TOUR_PAGE_SIZE,
  };
}

export function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / TOUR_PAGE_SIZE));
}
