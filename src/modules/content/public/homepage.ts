import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { type IsoMonth, upcomingMonths } from "@/lib/dates";
import { features } from "@/lib/features";
import { DESTINATIONS_TAG, REVIEWS_TAG, SETTINGS_TAG, TOURS_TAG, TRAVEL_STYLES_TAG } from "@/modules/catalog/cache-tags";
import { getFeaturedTourCards } from "@/modules/catalog/public/tour-public.service";
import type { MediaRow } from "@/modules/catalog/public/tour-public.mapping";
import type { Locale, TourCardItem } from "@/modules/catalog/public/types";

import {
  type HomeDestination,
  type HomeHero,
  type HomePost,
  type HomeTestimonial,
  type HomeTravelStyle,
  pickTestimonial,
  toDestinations,
  toHero,
  toPosts,
  toTravelStyles,
} from "./homepage.mapping";
import * as repo from "./homepage.repository";
import { homepageSettingSchema } from "./homepage.schemas";

/** Same tag the journal admin refreshes (content.service.ts `POSTS_TAG`). */
const POSTS_TAG = "posts";
/** Short cache for a failed section, as for settings (Phase 3 spec decision 12). */
const FAILED = { stale: 30, revalidate: 30, expire: 300 } as const;

export type Homepage = {
  hero: HomeHero;
  featuredTours: TourCardItem[];
  destinations: HomeDestination[];
  travelStyles: HomeTravelStyle[];
  testimonial: HomeTestimonial | null;
  posts: HomePost[];
  /** Departure months offered by the hero search (this month and the next 11, Vietnam time). */
  searchMonths: IsoMonth[];
};

function log(section: string, error: unknown) {
  console.error(`homepage ${section} failed`, error instanceof Error ? error.message : (error as { message?: string })?.message ?? error);
}

/** Runs one section's read; a failure leaves the section out and shortens the cache (decision 12). */
async function section<T>(name: string, empty: T, read: () => Promise<T>): Promise<{ value: T; failed: boolean }> {
  try {
    return { value: await read(), failed: false };
  } catch (error) {
    log(name, error);
    return { value: empty, failed: true };
  }
}

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/**
 * Everything the homepage shows, in one cached read (Phase 3 spec decisions 3, 18 and 19): the
 * `homepage` setting (hero text and optional image, featured destination keys, journal count),
 * featured tours, featured destinations, travel styles, one featured review and the latest
 * articles. Refreshed by the admin's tag updates. Each section fails on its own: the page renders
 * the rest, and a section with no data is left out by the page.
 */
export async function getHomepage(locale: Locale): Promise<Homepage> {
  "use cache";
  cacheTag(SETTINGS_TAG, TOURS_TAG, DESTINATIONS_TAG, TRAVEL_STYLES_TAG, REVIEWS_TAG, POSTS_TAG);
  cacheLife("hours");

  const settingResult = await section("setting", null, async () => check(await repo.findHomepageSetting())?.value ?? null);
  const setting = homepageSettingSchema.parse(settingResult.value ?? {});
  const heroMediaId = setting.hero?.media_id ?? null;

  const [heroMedia, featuredTours, destinations, travelStyles, testimonial, posts] = await Promise.all([
    section("hero image", null as MediaRow | null, async () =>
      heroMediaId ? ((check(await repo.findMedia(heroMediaId)) as MediaRow | null) ?? null) : null,
    ),
    // The catalog read handles its own failures (an empty list).
    getFeaturedTourCards(locale, 3).then((value) => ({ value, failed: false })),
    section("destinations", [] as HomeDestination[], async () =>
      setting.featured_destination_keys.length
        ? toDestinations(
            setting.featured_destination_keys,
            check(await repo.findDestinationsByKey(locale, setting.featured_destination_keys)) ?? [],
            locale,
          )
        : [],
    ),
    section("travel styles", [] as HomeTravelStyle[], async () =>
      toTravelStyles(check(await repo.findTravelStyles(locale)) ?? [], locale),
    ),
    section("testimonial", null as HomeTestimonial | null, async () =>
      pickTestimonial(check(await repo.findFeaturedReviews()) ?? [], locale),
    ),
    section("journal", [] as HomePost[], async () =>
      // Read only once the journal routes exist (PR K): a teaser must not link to a 404.
      features.journal && setting.journal_teaser_count > 0
        ? toPosts(check(await repo.findLatestPosts(locale, setting.journal_teaser_count)) ?? [], locale)
        : [],
    ),
  ]);

  if ([settingResult, heroMedia, destinations, travelStyles, testimonial, posts].some((result) => result.failed)) {
    cacheLife(FAILED);
  }

  return {
    hero: toHero(setting, locale, heroMedia.value),
    featuredTours: featuredTours.value,
    destinations: destinations.value,
    travelStyles: travelStyles.value,
    testimonial: testimonial.value,
    posts: posts.value,
    // Computed inside the cache (a prerendered page cannot read the clock); refreshed hourly.
    searchMonths: upcomingMonths(12),
  };
}
