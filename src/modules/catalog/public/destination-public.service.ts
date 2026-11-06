import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { getPathname } from "@/i18n/navigation";
import { mediaUrl, type ImageData } from "@/lib/images";
import { richTextIsEmpty, richTextMediaIds } from "@/lib/rich-text";

import { DESTINATIONS_TAG, TOURS_TAG, TRAVEL_STYLES_TAG } from "../cache-tags";
import { buildDestinationIndex, type DestinationRowData, type DestinationSummary, findInIndex, subtreeIds } from "./destination-public.mapping";
import * as repo from "./destination-public.repository";
import { toImage } from "./tour-public.mapping";
import { findMediaByIds } from "./tour-public.repository";
import { getTourCards } from "./tour-public.service";
import type { Locale, LocaleLinks, TourCardItem } from "./types";

/** Public destination and travel-style reads (Phase 3 spec PR J; decisions 2–6, 12). */

const LOCALES: Locale[] = ["vi", "en"];

/** An image inside rich content, as the `RichText` renderer takes it. */
export type ContentMedia = { url: string; alt: { vi: string; en: string }; width: number | null; height: number | null };
const FAILED = { stale: 30, revalidate: 30, expire: 300 } as const;

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what} failed: ${error.message}`);
}

export type PageResult<T> = { kind: "found"; page: T } | { kind: "redirect"; slug: string } | { kind: "missing" };

type Dynamic = "/destinations/[slug]" | "/travel-styles/[slug]";

/** Per-language paths; a language without a published translation links to `fallback`. */
function localeLinks(pathname: Dynamic, slugs: { locale: string; slug: string }[], fallback: "/destinations" | "/tours"): LocaleLinks {
  return Object.fromEntries(
    LOCALES.map((locale) => {
      const slug = slugs.find((row) => row.locale === locale)?.slug;
      return [
        locale,
        slug
          ? { href: getPathname({ locale, href: { pathname, params: { slug } } }), available: true }
          : { href: getPathname({ locale, href: fallback }), available: false },
      ];
    }),
  ) as LocaleLinks;
}

/** The destination tree of one language with tour counts (index page, children, breadcrumbs). */
async function loadIndex(locale: Locale): Promise<DestinationSummary[]> {
  const [rows, links] = await Promise.all([repo.findDestinationRows(locale), repo.findTourDestinationLinks(locale)]);
  if (rows.error) fail("destinations", rows.error);
  if (links.error) fail("destination tours", links.error);
  return buildDestinationIndex((rows.data ?? []) as DestinationRowData[], links.data ?? [], locale);
}

/**
 * Countries with their regions and cities, each with its number of tours (cached, tags
 * `destinations` and `tours`). Errors throw to the page's error state (decision 12).
 */
export async function getDestinationIndex(locale: Locale): Promise<DestinationSummary[]> {
  "use cache";
  cacheTag(DESTINATIONS_TAG, TOURS_TAG);
  cacheLife("hours");
  return loadIndex(locale);
}

export type DestinationPage = {
  id: string;
  key: string;
  type: DestinationSummary["type"];
  name: string;
  summary: string | null;
  bestTime: string | null;
  content: unknown | null;
  contentMedia: Record<string, ContentMedia>;
  seoTitle: string | null;
  seoDescription: string | null;
  image: ImageData | null;
  ancestors: { name: string; slug: string }[];
  children: DestinationSummary[];
  tours: TourCardItem[];
  alternates: LocaleLinks;
};

async function mediaMap(content: unknown): Promise<Record<string, ContentMedia>> {
  const ids = richTextMediaIds(content);
  if (ids.length === 0) return {};
  const { data, error } = await findMediaByIds(ids);
  if (error) fail("content images", error);
  return Object.fromEntries(
    (data ?? []).map((row) => {
      const alt = (row.alt ?? {}) as Partial<Record<Locale, string>>;
      return [row.id, { url: mediaUrl(row.path), alt: { vi: alt.vi ?? "", en: alt.en ?? "" }, width: row.width, height: row.height }];
    }),
  );
}

/**
 * One destination in one language (cached, tags `destinations`, `tours`, `travel-styles`): its
 * page fields, parents, children with counts, rich content with its images, and its tours (the
 * destination and everything below it, via `search_tours`). A slug of the other language yields
 * a redirect; an unpublished or missing translation is `missing` (decision 5).
 */
export async function getDestinationPage(locale: Locale, slug: string): Promise<PageResult<DestinationPage>> {
  "use cache";
  cacheTag(DESTINATIONS_TAG, TOURS_TAG, TRAVEL_STYLES_TAG);
  cacheLife("hours");

  const { data, error } = await repo.findDestinationBySlug(locale, slug);
  if (error) fail("destination", error);
  if (!data) {
    const other = await repo.findDestinationBySlugInOtherLocale(locale, slug);
    if (other.error) fail("destination by other slug", other.error);
    if (!other.data) return { kind: "missing" };
    const slugs = await repo.findDestinationSlugs(other.data.destination_id);
    if (slugs.error) fail("destination slugs", slugs.error);
    const mine = slugs.data?.find((row) => row.locale === locale);
    return mine ? { kind: "redirect", slug: mine.slug } : { kind: "missing" };
  }

  const destination = data.destinations;
  const [index, slugs] = await Promise.all([loadIndex(locale), repo.findDestinationSlugs(destination.id)]);
  if (slugs.error) fail("destination slugs", slugs.error);
  const found = findInIndex(index, destination.id);
  // Published and translated, but under a hidden parent: not reachable from the tree, so not shown.
  if (!found) return { kind: "missing" };

  const content = richTextIsEmpty(data.content) ? null : data.content;
  const [tours, contentMedia] = await Promise.all([
    getTourCards(locale, { destinationIds: subtreeIds(found.node) }),
    content ? mediaMap(content) : Promise.resolve({}),
  ]);

  return {
    kind: "found",
    page: {
      id: destination.id,
      key: destination.key,
      type: destination.type,
      name: data.name,
      summary: data.summary?.trim() || null,
      bestTime: data.best_time_to_visit?.trim() || null,
      content,
      contentMedia,
      seoTitle: data.seo_title?.trim() || null,
      seoDescription: data.seo_description?.trim() || null,
      image: toImage(destination.hero, locale),
      ancestors: found.ancestors.map((node) => ({ name: node.name, slug: node.slug })),
      children: found.node.children,
      tours,
      alternates: localeLinks("/destinations/[slug]", slugs.data ?? [], "/destinations"),
    },
  };
}

/** Published destination slugs of one language for generateStaticParams (empty on failure). */
export async function getPublishedDestinationSlugs(locale: Locale): Promise<string[]> {
  "use cache";
  cacheTag(DESTINATIONS_TAG);
  cacheLife("hours");
  try {
    const { data, error } = await repo.listDestinationSlugs(locale);
    if (error) fail("destination slugs", error);
    return (data ?? []).map((row) => row.slug);
  } catch (error) {
    console.error("getPublishedDestinationSlugs failed", error instanceof Error ? error.message : error);
    cacheLife(FAILED);
    return [];
  }
}

export type TravelStylePage = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  image: ImageData | null;
  tours: TourCardItem[];
  /** The other published styles, for links at the end of the page. */
  others: { key: string; slug: string; name: string }[];
  alternates: LocaleLinks;
};

/** One travel style in one language with its tours (cached; same rules as destinations). */
export async function getTravelStylePage(locale: Locale, slug: string): Promise<PageResult<TravelStylePage>> {
  "use cache";
  cacheTag(TRAVEL_STYLES_TAG, TOURS_TAG, DESTINATIONS_TAG);
  cacheLife("hours");

  const { data, error } = await repo.findTravelStyleBySlug(locale, slug);
  if (error) fail("travel style", error);
  if (!data) {
    const other = await repo.findTravelStyleBySlugInOtherLocale(locale, slug);
    if (other.error) fail("travel style by other slug", other.error);
    if (!other.data) return { kind: "missing" };
    const slugs = await repo.findTravelStyleSlugs(other.data.travel_style_id);
    if (slugs.error) fail("travel style slugs", slugs.error);
    const mine = slugs.data?.find((row) => row.locale === locale);
    return mine ? { kind: "redirect", slug: mine.slug } : { kind: "missing" };
  }

  const style = data.travel_styles;
  const [tours, slugs, all] = await Promise.all([
    getTourCards(locale, { travelStyleIds: [style.id] }),
    repo.findTravelStyleSlugs(style.id),
    repo.findTravelStyleRows(locale),
  ]);
  if (slugs.error) fail("travel style slugs", slugs.error);
  if (all.error) fail("travel styles", all.error);

  return {
    kind: "found",
    page: {
      id: style.id,
      key: style.key,
      name: data.name,
      description: data.description?.trim() || null,
      seoTitle: data.seo_title?.trim() || null,
      seoDescription: data.seo_description?.trim() || null,
      image: toImage(style.hero, locale),
      tours,
      others: (all.data ?? [])
        .filter((row) => row.id !== style.id && row.travel_style_translations[0])
        .map((row) => ({ key: row.key, slug: row.travel_style_translations[0].slug, name: row.travel_style_translations[0].name })),
      alternates: localeLinks("/travel-styles/[slug]", slugs.data ?? [], "/tours"),
    },
  };
}

export async function getPublishedTravelStyleSlugs(locale: Locale): Promise<string[]> {
  "use cache";
  cacheTag(TRAVEL_STYLES_TAG);
  cacheLife("hours");
  try {
    const { data, error } = await repo.listTravelStyleSlugs(locale);
    if (error) fail("travel style slugs", error);
    return (data ?? []).map((row) => row.slug);
  } catch (error) {
    console.error("getPublishedTravelStyleSlugs failed", error instanceof Error ? error.message : error);
    cacheLife(FAILED);
    return [];
  }
}
