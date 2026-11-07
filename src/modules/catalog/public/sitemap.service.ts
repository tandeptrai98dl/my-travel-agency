import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import type { SitemapEntry } from "@/lib/sitemap";

import { DESTINATIONS_TAG, TOURS_TAG, TRAVEL_STYLES_TAG } from "../cache-tags";
import type { DestinationSummary } from "./destination-public.mapping";
import { getDestinationIndex } from "./destination-public.service";
import * as repo from "./sitemap.repository";
import type { Locale } from "./types";

/**
 * Catalog entries of sitemap.xml (Phase 3 spec step 19): the pages that render, per language,
 * cached with the tags the admin refreshes, so an unpublished page leaves the sitemap after the
 * save. Errors throw rather than return an empty list, so a failed re-render keeps the last good sitemap.
 */

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what} failed: ${error.message}`);
}

export async function getTourSitemap(): Promise<SitemapEntry[]> {
  "use cache";
  cacheTag(TOURS_TAG);
  cacheLife("hours");
  const { data, error } = await repo.listTourEntries();
  if (error) fail("tour sitemap", error);
  return (data ?? []).flatMap((row) =>
    isLocale(row.locale)
      ? [{ path: getPathname({ locale: row.locale, href: { pathname: "/tours/[slug]", params: { slug: row.slug } } }), lastModified: row.tours.updated_at }]
      : [],
  );
}

function ids(nodes: DestinationSummary[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    into.add(node.id);
    ids(node.children, into);
  }
  return into;
}

/** Destinations reachable in each language's tree (a hidden parent makes the page a 404). */
export async function getDestinationSitemap(): Promise<SitemapEntry[]> {
  "use cache";
  cacheTag(DESTINATIONS_TAG, TOURS_TAG);
  cacheLife("hours");
  const locales: Locale[] = ["vi", "en"];
  const [{ data, error }, ...trees] = await Promise.all([repo.listDestinationEntries(), ...locales.map((l) => getDestinationIndex(l))]);
  if (error) fail("destination sitemap", error);
  const reachable = new Map(locales.map((l, i) => [l, ids(trees[i])]));
  return (data ?? []).flatMap((row) =>
    isLocale(row.locale) && reachable.get(row.locale)?.has(row.destination_id)
      ? [
          {
            path: getPathname({ locale: row.locale, href: { pathname: "/destinations/[slug]", params: { slug: row.slug } } }),
            lastModified: row.destinations.updated_at,
          },
        ]
      : [],
  );
}

/** Travel styles have no change timestamp, so their entries have no `lastmod`. */
export async function getTravelStyleSitemap(): Promise<SitemapEntry[]> {
  "use cache";
  cacheTag(TRAVEL_STYLES_TAG);
  cacheLife("hours");
  const { data, error } = await repo.listTravelStyleEntries();
  if (error) fail("travel style sitemap", error);
  return (data ?? []).flatMap((row) =>
    isLocale(row.locale)
      ? [{ path: getPathname({ locale: row.locale, href: { pathname: "/travel-styles/[slug]", params: { slug: row.slug } } }), lastModified: null }]
      : [],
  );
}
