import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

import { MEDIA_COLUMNS } from "./tour-public.repository";
import type { Locale } from "./types";

/**
 * Public destination and travel-style reads as anon (Phase 3 spec decision 2): RLS returns only
 * published rows and translations with `is_published`. Explicit columns only.
 */

/** Every published destination with its translation in one language (index, children, parents). */
export async function findDestinationRows(locale: Locale) {
  return createPublicClient()
    .from("destinations")
    .select(
      `id, key, type, parent_id, sort_order,
       hero:media!destinations_hero_media_id_fkey(${MEDIA_COLUMNS}),
       destination_translations!inner(slug, name, summary, best_time_to_visit, locale)`,
    )
    .eq("status", "published")
    .eq("destination_translations.locale", locale)
    .eq("destination_translations.is_published", true)
    .order("sort_order");
}

/** One destination translation by slug, with the fields of its page. */
export async function findDestinationBySlug(locale: Locale, slug: string) {
  return createPublicClient()
    .from("destination_translations")
    .select(
      `destination_id, slug, name, summary, content, best_time_to_visit, seo_title, seo_description,
       destinations!inner(id, key, type, parent_id, status, latitude, longitude,
         hero:media!destinations_hero_media_id_fkey(${MEDIA_COLUMNS}))`,
    )
    .eq("locale", locale)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
}

/** A published destination translation of the other language with this slug (shared links). */
export async function findDestinationBySlugInOtherLocale(locale: Locale, slug: string) {
  return createPublicClient()
    .from("destination_translations")
    .select("destination_id")
    .neq("locale", locale)
    .eq("slug", slug)
    .eq("is_published", true)
    .limit(1)
    .maybeSingle();
}

/** Published slugs of one destination per language (hreflang, the language switcher). */
export async function findDestinationSlugs(destinationId: string) {
  return createPublicClient()
    .from("destination_translations")
    .select("locale, slug")
    .eq("destination_id", destinationId)
    .eq("is_published", true);
}

/** Published slugs of one language, for generateStaticParams. */
export async function listDestinationSlugs(locale: Locale) {
  return createPublicClient()
    .from("destination_translations")
    .select("slug, destinations!inner(status)")
    .eq("locale", locale)
    .eq("is_published", true)
    .eq("destinations.status", "published")
    .limit(1000);
}

/** Tours with a published translation in this language, and their destinations (for counts). */
export async function findTourDestinationLinks(locale: Locale) {
  return createPublicClient()
    .from("tour_destinations")
    .select("tour_id, destination_id, tours!inner(status, tour_translations!inner(locale, is_published))")
    .eq("tours.status", "published")
    .eq("tours.tour_translations.locale", locale)
    .eq("tours.tour_translations.is_published", true)
    .limit(5000);
}

export async function findTravelStyleBySlug(locale: Locale, slug: string) {
  return createPublicClient()
    .from("travel_style_translations")
    .select(
      `travel_style_id, slug, name, description, seo_title, seo_description,
       travel_styles!inner(id, key, status, hero:media!travel_styles_hero_media_id_fkey(${MEDIA_COLUMNS}))`,
    )
    .eq("locale", locale)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
}

export async function findTravelStyleBySlugInOtherLocale(locale: Locale, slug: string) {
  return createPublicClient()
    .from("travel_style_translations")
    .select("travel_style_id")
    .neq("locale", locale)
    .eq("slug", slug)
    .eq("is_published", true)
    .limit(1)
    .maybeSingle();
}

export async function findTravelStyleSlugs(travelStyleId: string) {
  return createPublicClient()
    .from("travel_style_translations")
    .select("locale, slug")
    .eq("travel_style_id", travelStyleId)
    .eq("is_published", true);
}

/** Every published travel style in one language (the "other styles" links). */
export async function findTravelStyleRows(locale: Locale) {
  return createPublicClient()
    .from("travel_styles")
    .select("id, key, sort_order, travel_style_translations!inner(slug, name, locale)")
    .eq("status", "published")
    .eq("travel_style_translations.locale", locale)
    .eq("travel_style_translations.is_published", true)
    .order("sort_order");
}

export async function listTravelStyleSlugs(locale: Locale) {
  return createPublicClient()
    .from("travel_style_translations")
    .select("slug, travel_styles!inner(status)")
    .eq("locale", locale)
    .eq("is_published", true)
    .eq("travel_styles.status", "published")
    .limit(1000);
}
