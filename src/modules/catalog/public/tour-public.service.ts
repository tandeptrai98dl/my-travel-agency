import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { getPathname } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { todayInVietnam, type IsoDate } from "@/lib/dates";
import type { ImageData } from "@/lib/images";
import { getDestinationTree } from "@/modules/catalog/destinations.service";
import type { DestinationNode } from "@/modules/catalog/destinations";

import {
  CANCELLATION_POLICIES_TAG,
  DESTINATIONS_TAG,
  REVIEWS_TAG,
  TOURS_TAG,
  TRAVEL_STYLES_TAG,
  tourTag,
} from "../cache-tags";
import {
  buildCards,
  countryOf,
  readFaqs,
  readItinerary,
  readPolicy,
  readPriceTiers,
  readStrings,
  toImage,
  withDescendants,
  type CardRow,
  type DestinationRef,
  type Faq,
  type ItineraryDay,
  type MediaRow,
  type Policy,
  type PriceTier,
  type SearchRow,
} from "./tour-public.mapping";
import * as repo from "./tour-public.repository";
import type { Locale, LocaleLinks, TourCardItem } from "./types";

/** Public tour reads (Phase 3 spec decisions 2–5, 8, 12). */

const LOCALES: Locale[] = ["vi", "en"];

export type TourPage = {
  id: string;
  code: string;
  type: "group" | "private";
  scope: "domestic" | "international";
  locale: Locale;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string;
  highlights: string[];
  itinerary: (ItineraryDay & { image: ImageData | null })[];
  inclusions: string[];
  exclusions: string[];
  practicalInfo: string | null;
  faqs: Faq[];
  seoTitle: string | null;
  seoDescription: string | null;
  durationDays: number;
  durationNights: number;
  minPax: number;
  maxPax: number | null;
  minPaxToOperate: number | null;
  fromPrice: number;
  depositPercent: number;
  balanceDueDays: number;
  childAgeMax: number;
  infantAgeMax: number;
  hero: ImageData | null;
  gallery: ImageData[];
  ogImage: ImageData | null;
  destinations: { id: string; key: string; name: string; slug: string }[];
  countryIds: string[];
  styles: { id: string; key: string; name: string; slug: string }[];
  policy: Policy | null;
  priceTiers: PriceTier[];
  alternates: LocaleLinks;
  updatedAt: string;
};

export type TourPageResult =
  | { kind: "found"; tour: TourPage }
  | { kind: "redirect"; slug: string }
  | { kind: "missing" };

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what} failed: ${error.message}`);
}

function flattenTree(nodes: DestinationNode[], out = new Map<string, DestinationNode>()): Map<string, DestinationNode> {
  for (const node of nodes) {
    out.set(node.key, node);
    flattenTree(node.children, out);
  }
  return out;
}

async function destinationLookup(locale: Locale) {
  const [tree, refs] = await Promise.all([getDestinationTree(locale), repo.findDestinations()]);
  if (refs.error) fail("destinations", refs.error);
  const byKey = flattenTree(tree);
  const all: DestinationRef[] = refs.data ?? [];
  const keyById = new Map(all.map((row) => [row.id, row.key]));
  return {
    all,
    /** Name and slug in this language, or null when the destination is not published in it. */
    byId(id: string) {
      const key = keyById.get(id);
      const node = key ? byKey.get(key) : undefined;
      return key && node ? { key, name: node.name, slug: node.slug } : null;
    },
  };
}

/** Per-language paths of a tour; a language without a translation links to its listing. */
export function tourLocaleLinks(slugs: Partial<Record<Locale, string>>): LocaleLinks {
  return Object.fromEntries(
    LOCALES.map((locale) => {
      const slug = slugs[locale];
      return [
        locale,
        slug
          ? { href: getPathname({ locale, href: { pathname: "/tours/[slug]", params: { slug } } }), available: true }
          : { href: getPathname({ locale, href: "/tours" }), available: false },
      ];
    }),
  ) as LocaleLinks;
}

/**
 * One published tour in one language, cached (tags `tours`, `tour:<id>`, destinations, travel
 * styles, policies). A slug of the other language yields a redirect to this language's slug.
 * Database errors throw (decision 12); a missing tour is `missing`.
 */
export async function getTourPage(locale: Locale, slug: string): Promise<TourPageResult> {
  "use cache";
  cacheTag(TOURS_TAG, DESTINATIONS_TAG, TRAVEL_STYLES_TAG, CANCELLATION_POLICIES_TAG);
  cacheLife("hours");

  const { data, error } = await repo.findTranslationBySlug(locale, slug);
  if (error) fail("tour", error);
  if (!data) {
    const other = await repo.findTourIdBySlugInOtherLocale(locale, slug);
    if (other.error) fail("tour by other slug", other.error);
    if (!other.data) return { kind: "missing" };
    const slugs = await repo.findTranslationSlugs([other.data.tour_id]);
    if (slugs.error) fail("tour slugs", slugs.error);
    const mine = slugs.data?.find((row) => row.locale === locale);
    return mine ? { kind: "redirect", slug: mine.slug } : { kind: "missing" };
  }

  const tour = data.tours;
  cacheTag(tourTag(tour.id));
  return { kind: "found", tour: await assembleTourPage(data, locale) };
}

type TourPageRow = NonNullable<Awaited<ReturnType<typeof repo.findTranslationBySlug>>["data"]>;

async function assembleTourPage(data: TourPageRow, locale: Locale, client?: repo.ReadClient): Promise<TourPage> {
  const tour = data.tours;

  const itinerary = readItinerary(data.itinerary);
  const dayMediaIds = [...new Set(itinerary.flatMap((day) => (day.mediaId ? [day.mediaId] : [])))];
  const [lookup, slugs, defaultPolicy, dayMedia] = await Promise.all([
    destinationLookup(locale),
    repo.findTranslationSlugs([tour.id], client),
    tour.policy ? Promise.resolve(null) : repo.findDefaultPolicy(client),
    dayMediaIds.length ? repo.findMediaByIds(dayMediaIds, client) : Promise.resolve(null),
  ]);
  if (slugs.error) fail("tour slugs", slugs.error);
  if (defaultPolicy?.error) fail("default policy", defaultPolicy.error);
  if (dayMedia?.error) fail("itinerary media", dayMedia.error);

  const dayImages = new Map((dayMedia?.data ?? []).map((row) => [row.id, toImage(row as MediaRow, locale)]));
  const destinations = tour.tour_destinations.flatMap((link) => {
    const found = lookup.byId(link.destination_id);
    return found ? [{ id: link.destination_id, ...found }] : [];
  });
  const hero = toImage(tour.hero as MediaRow | null, locale);
  const gallery = [...tour.tour_media]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((item) => {
      const image = toImage(item.media as MediaRow | null, locale);
      return image && image.src !== hero?.src ? [image] : [];
    });
  const slugByLocale = Object.fromEntries((slugs.data ?? []).map((row) => [row.locale, row.slug])) as Partial<
    Record<Locale, string>
  >;

  return {
    id: tour.id,
    code: tour.code,
    type: tour.type,
    scope: tour.scope,
    locale,
    slug: data.slug,
    title: data.title,
    subtitle: data.subtitle,
    summary: data.summary,
    highlights: readStrings(data.highlights),
    itinerary: itinerary.map((day) => ({ ...day, image: day.mediaId ? (dayImages.get(day.mediaId) ?? null) : null })),
    inclusions: readStrings(data.inclusions),
    exclusions: readStrings(data.exclusions),
    practicalInfo: typeof data.practical_info === "string" && data.practical_info.trim() ? data.practical_info.trim() : null,
    faqs: readFaqs(data.faqs),
    seoTitle: data.seo_title,
    seoDescription: data.seo_description,
    durationDays: tour.duration_days,
    durationNights: tour.duration_nights,
    minPax: tour.min_pax,
    maxPax: tour.max_pax,
    minPaxToOperate: tour.min_pax_to_operate,
    fromPrice: tour.from_price,
    depositPercent: tour.deposit_percent,
    balanceDueDays: tour.balance_due_days,
    childAgeMax: tour.child_age_max,
    infantAgeMax: tour.infant_age_max,
    hero,
    gallery,
    ogImage: toImage(data.og as MediaRow | null, locale) ?? hero,
    destinations,
    countryIds: [...new Set(destinations.map((d) => countryOf(d.id, lookup.all)))],
    styles: tour.tour_travel_styles.flatMap((link) => {
      const style = link.travel_styles;
      const translation = style?.travel_style_translations.find((row) => row.locale === locale);
      return style && translation
        ? [{ id: link.travel_style_id, key: style.key, name: translation.name, slug: translation.slug }]
        : [];
    }),
    policy: readPolicy(tour.policy ?? defaultPolicy?.data ?? null, locale),
    priceTiers: readPriceTiers(tour.price_tiers, todayInVietnam()),
    alternates: tourLocaleLinks(slugByLocale),
    updatedAt: tour.updated_at,
  };
}


/**
 * A tour as its public page would show it, read with the staff session (drafts included) for the
 * admin preview (decision 17). Uncached. Null when the tour has no row in that language.
 */
export async function getTourPreview(tourId: string, locale: Locale): Promise<TourPage | null> {
  await requirePermission("tours.read");
  const client = await createClient();
  const { data, error } = await repo.findTranslationByTourId(client, tourId, locale);
  if (error) fail("tour preview", error);
  return data ? assembleTourPage(data, locale, client) : null;
}

/** Departures for the preview, with the staff session. */
export async function getTourPreviewDepartures(tourId: string): Promise<Departure[]> {
  await requirePermission("tours.read");
  const client = await createClient();
  const { data, error } = await repo.findDepartures(tourId, client);
  if (error) fail("departures", error);
  return mapDepartures(data ?? []);
}

export type Departure = {
  id: string;
  startDate: IsoDate;
  endDate: IsoDate;
  status: "open" | "guaranteed" | "closed" | "cancelled";
  priceAdult: number;
  priceChild: number | null;
  priceInfant: number | null;
  singleSupplement: number | null;
  seatsLeft: number;
  bookable: boolean;
  note: string | null;
};

/** Upcoming departures of a tour, live (never cached: seats change with every booking). */
export async function getTourDepartures(tourId: string): Promise<Departure[]> {
  const { data, error } = await repo.findDepartures(tourId);
  if (error) fail("departures", error);
  return mapDepartures(data ?? []);
}

type DepartureRow = NonNullable<Awaited<ReturnType<typeof repo.findDepartures>>["data"]>[number];

function mapDepartures(rows: DepartureRow[]): Departure[] {
  return rows.map((row) => ({
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    priceAdult: row.price_adult,
    priceChild: row.price_child,
    priceInfant: row.price_infant,
    singleSupplement: row.single_supplement,
    seatsLeft: row.seats_left,
    bookable: row.bookable,
    note: row.note?.trim() ? row.note.trim() : null,
  }));
}

/** Cards for tours returned by `search_tours`, in that order. */
async function cardsFor(locale: Locale, hits: SearchRow[]): Promise<TourCardItem[]> {
  if (hits.length === 0) return [];
  const [rows, lookup] = await Promise.all([
    repo.findTourCards(
      locale,
      hits.map((hit) => hit.tour_id),
    ),
    destinationLookup(locale),
  ]);
  if (rows.error) fail("tour cards", rows.error);
  return buildCards(hits, (rows.data ?? []) as unknown as CardRow[], (id) => {
    const found = lookup.byId(id);
    return found ? { key: found.key, name: found.name } : null;
  }, locale);
}

/**
 * Up to three other tours in the same countries, then of the same travel styles (cached; cards on
 * cached pages show no seat badges). An empty list on failure: related tours are optional.
 */
export async function getRelatedTours(locale: Locale, tour: Pick<TourPage, "id" | "countryIds" | "styles">): Promise<TourCardItem[]> {
  "use cache";
  cacheTag(TOURS_TAG, DESTINATIONS_TAG, tourTag(tour.id));
  cacheLife("hours");

  try {
    const lookup = await destinationLookup(locale);
    const destinationIds = withDescendants(tour.countryIds, lookup.all);
    const hits: SearchRow[] = [];
    if (destinationIds.length) {
      const { data, error } = await repo.searchTours({ locale, destinationIds, excludeIds: [tour.id], limit: 3 });
      if (error) fail("related tours", error);
      hits.push(...(data ?? []));
    }
    if (hits.length < 3 && tour.styles.length) {
      const { data, error } = await repo.searchTours({
        locale,
        travelStyleIds: tour.styles.map((style) => style.id),
        excludeIds: [tour.id, ...hits.map((hit) => hit.tour_id)],
        limit: 3 - hits.length,
      });
      if (error) fail("tours of the same style", error);
      hits.push(...(data ?? []));
    }
    return await cardsFor(locale, hits);
  } catch (error) {
    console.error("getRelatedTours failed", error instanceof Error ? error.message : error);
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    return [];
  }
}

/** Published slugs of one language for generateStaticParams (empty on failure, decision 4). */
export async function getPublishedTourSlugs(locale: Locale): Promise<string[]> {
  "use cache";
  cacheTag(TOURS_TAG);
  cacheLife("hours");
  try {
    const { data, error } = await repo.listPublishedSlugs();
    if (error) fail("tour slugs", error);
    return (data ?? []).filter((row) => row.locale === locale).map((row) => row.slug);
  } catch (error) {
    console.error("getPublishedTourSlugs failed", error instanceof Error ? error.message : error);
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    return [];
  }
}

export type TourReview = {
  id: string;
  authorName: string;
  authorCountry: string | null;
  rating: number;
  title: string | null;
  content: string;
  locale: Locale;
  travelDate: IsoDate | null;
  verified: boolean;
};

export type TourReviews = { count: number; average: number | null; latest: TourReview[] };

/** Approved reviews of a tour: count, average and the three newest (decision 21; cached). */
export async function getTourReviews(tourId: string): Promise<TourReviews> {
  "use cache";
  cacheTag(REVIEWS_TAG, tourTag(tourId));
  cacheLife("hours");
  try {
    const { data, error } = await repo.findTourReviews(tourId);
    if (error) fail("reviews", error);
    const rows = data ?? [];
    const average = rows.length ? Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length) * 10) / 10 : null;
    return {
      count: rows.length,
      average,
      latest: rows.slice(0, 3).map((row) => ({
        id: row.id,
        authorName: row.author_name,
        authorCountry: row.author_country,
        rating: row.rating,
        title: row.title,
        content: row.content,
        locale: row.locale,
        travelDate: row.travel_date,
        verified: row.is_verified,
      })),
    };
  } catch (error) {
    // Reviews are optional on the page: an outage hides them instead of failing the tour.
    console.error("getTourReviews failed", error instanceof Error ? error.message : error);
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    return { count: 0, average: null, latest: [] };
  }
}

/** Every published tour as cards, recommended order (interim listing until PR L; cached, no seats). */
export async function getAllTourCards(locale: Locale): Promise<TourCardItem[]> {
  "use cache";
  cacheTag(TOURS_TAG, DESTINATIONS_TAG);
  cacheLife("hours");
  try {
    const { data, error } = await repo.searchTours({ locale, limit: 48 });
    if (error) fail("tour list", error);
    return await cardsFor(locale, data ?? []);
  } catch (error) {
    console.error("getAllTourCards failed", error instanceof Error ? error.message : error);
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    return [];
  }
}


/**
 * Featured tours for the homepage (`tours.is_featured`, recommended order; cached, so cards show no
 * seat badges, decision 3). An empty list on failure: the section is then left out (decision 12).
 */
export async function getFeaturedTourCards(locale: Locale, limit = 3): Promise<TourCardItem[]> {
  "use cache";
  cacheTag(TOURS_TAG, DESTINATIONS_TAG);
  cacheLife("hours");
  try {
    const { data, error } = await repo.searchTours({ locale, featuredOnly: true, limit });
    if (error) fail("featured tours", error);
    return await cardsFor(locale, data ?? []);
  } catch (error) {
    console.error("getFeaturedTourCards failed", error instanceof Error ? error.message : error);
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    return [];
  }
}

/**
 * Tours of some destinations (with their descendants already expanded by the caller) or travel
 * styles, recommended order, as cards (cached; no seat badges, decision 3). Used by the
 * destination and travel style pages. Database errors throw: the page shows its error state.
 */
export async function getTourCards(
  locale: Locale,
  filter: { destinationIds?: string[]; travelStyleIds?: string[] },
  limit = 48,
): Promise<TourCardItem[]> {
  "use cache";
  cacheTag(TOURS_TAG, DESTINATIONS_TAG, TRAVEL_STYLES_TAG);
  cacheLife("hours");
  const { data, error } = await repo.searchTours({ locale, ...filter, limit });
  if (error) fail("tour cards", error);
  return cardsFor(locale, data ?? []);
}

