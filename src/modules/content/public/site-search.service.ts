import "server-only";

import { getPathname } from "@/i18n/navigation";
import { searchTourCards } from "@/modules/catalog/public/tour-public.service";
import type { Locale, TourCardItem } from "@/modules/catalog/public/types";
import { normalizeQuery } from "@/modules/catalog/tour-search-params";

import { vietnamDate } from "./content-public.mapping";
import * as repo from "./site-search.repository";

/** Site search (Phase 3 spec step 18): tours, destinations and journal articles for one term. */

export const SITE_SEARCH_TOURS = 6;
const OTHER_LIMIT = 8;

export type SiteSearchHit = { href: string; title: string; summary: string | null; date: string | null };

export type SiteSearchResult = {
  q: string;
  tours: TourCardItem[];
  tourTotal: number;
  destinations: SiteSearchHit[];
  posts: SiteSearchHit[];
};

/**
 * Live results for a term (2–100 characters; null otherwise). Tours come from `search_tours`, so
 * prices and seats are current; destinations and articles from `search_site`. Errors throw to the
 * page's error state.
 */
export async function searchSite(locale: Locale, raw: string | null | undefined): Promise<SiteSearchResult | null> {
  const q = normalizeQuery(raw);
  if (!q) return null;
  const [tours, other] = await Promise.all([searchTourCards(locale, { q, limit: SITE_SEARCH_TOURS }), repo.searchSite(locale, q, OTHER_LIMIT)]);
  if (other.error) throw new Error(`site search failed: ${other.error.message}`);
  const rows = other.data ?? [];
  const hit = (row: (typeof rows)[number], href: string): SiteSearchHit => ({
    href,
    title: row.title,
    summary: row.summary?.trim() || null,
    date: row.published_at ? vietnamDate(row.published_at) : null,
  });
  return {
    q,
    tours: tours.items,
    tourTotal: tours.total,
    destinations: rows
      .filter((row) => row.kind === "destination")
      .map((row) => hit(row, getPathname({ locale, href: { pathname: "/destinations/[slug]", params: { slug: row.slug } } }))),
    posts: rows
      .filter((row) => row.kind === "post")
      .map((row) => hit(row, getPathname({ locale, href: { pathname: "/journal/[slug]", params: { slug: row.slug } } }))),
  };
}
