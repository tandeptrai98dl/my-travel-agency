import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

import type { Locale } from "./types";

/**
 * Public catalog reads as anon (Phase 3 spec decision 2): RLS returns only published tours and
 * translations. Explicit columns only. Callers turn `error` into an exception.
 */

export const MEDIA_COLUMNS = "id, path, width, height, alt, blur_data_url";

const TOUR_COLUMNS =
  "id, code, type, scope, duration_days, duration_nights, min_pax, max_pax, min_pax_to_operate, from_price, deposit_percent, balance_due_days, child_age_max, infant_age_max, published_at, updated_at";

export async function findTranslationBySlug(locale: Locale, slug: string) {
  return createPublicClient()
    .from("tour_translations")
    .select(
      `tour_id, locale, slug, title, subtitle, summary, highlights, itinerary, inclusions, exclusions, practical_info, faqs, seo_title, seo_description,
       og:media!tour_translations_og_media_id_fkey(${MEDIA_COLUMNS}),
       tours!inner(${TOUR_COLUMNS},
         hero:media!tours_hero_media_id_fkey(${MEDIA_COLUMNS}),
         policy:cancellation_policies!tours_cancellation_policy_id_fkey(summary, rules),
         tour_media(sort_order, media(${MEDIA_COLUMNS})),
         tour_destinations(destination_id),
         tour_travel_styles(travel_style_id, travel_styles(key, travel_style_translations(locale, slug, name))),
         price_tiers(min_pax, max_pax, price_per_adult, valid_from, valid_to))`,
    )
    .eq("locale", locale)
    .eq("slug", slug)
    .maybeSingle();
}

/** The tour a slug of the other language belongs to (a switched or shared link). */
export async function findTourIdBySlugInOtherLocale(locale: Locale, slug: string) {
  return createPublicClient()
    .from("tour_translations")
    .select("tour_id")
    .neq("locale", locale)
    .eq("slug", slug)
    .maybeSingle();
}

/** Published translations (slug per language) of some tours. */
export async function findTranslationSlugs(tourIds: string[]) {
  return createPublicClient().from("tour_translations").select("tour_id, locale, slug").in("tour_id", tourIds);
}

export async function findDefaultPolicy() {
  return createPublicClient()
    .from("cancellation_policies")
    .select("summary, rules")
    .eq("is_default", true)
    .maybeSingle();
}

export async function findMediaByIds(ids: string[]) {
  return createPublicClient().from("media").select(MEDIA_COLUMNS).in("id", ids);
}

/** Card data for tours found by `search_tours` (translation, hero, destination ids). */
export async function findTourCards(locale: Locale, tourIds: string[]) {
  return createPublicClient()
    .from("tours")
    .select(
      `id, type, duration_days, duration_nights,
       hero:media!tours_hero_media_id_fkey(${MEDIA_COLUMNS}),
       tour_translations!inner(slug, title, locale),
       tour_destinations(destination_id)`,
    )
    .in("id", tourIds)
    .eq("tour_translations.locale", locale);
}

export type SearchToursArgs = {
  locale: Locale;
  q?: string;
  destinationIds?: string[];
  travelStyleIds?: string[];
  featuredOnly?: boolean;
  excludeIds?: string[];
  sort?: string;
  limit?: number;
  offset?: number;
};

export async function searchTours(args: SearchToursArgs) {
  return createPublicClient().rpc("search_tours", {
    p_locale: args.locale,
    p_q: args.q,
    p_destination_ids: args.destinationIds,
    p_travel_style_ids: args.travelStyleIds,
    p_featured_only: args.featuredOnly,
    p_exclude_ids: args.excludeIds,
    p_sort: args.sort,
    p_limit: args.limit,
    p_offset: args.offset,
  });
}

export async function findDepartures(tourId: string) {
  return createPublicClient().rpc("tour_departures", { p_tour_id: tourId });
}

/** Every published slug per language, for generateStaticParams (decision 4). */
export async function listPublishedSlugs() {
  return createPublicClient().from("tour_translations").select("locale, slug").limit(1000);
}

/** Destination ids by key, for the destination tree lookups. */
export async function findDestinations() {
  return createPublicClient().from("destinations").select("id, key, parent_id");
}
