import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import { MEDIA_COLUMNS } from "@/modules/catalog/public/tour-public.repository";
import type { Locale } from "@/modules/catalog/public/types";

/**
 * Homepage reads as anon (Phase 3 spec decision 2): RLS returns only published rows, approved
 * reviews and public settings. Explicit columns only.
 */

export async function findHomepageSetting() {
  return createPublicClient().from("settings").select("value").eq("key", "homepage").eq("is_public", true).maybeSingle();
}

export async function findMedia(id: string) {
  return createPublicClient().from("media").select(MEDIA_COLUMNS).eq("id", id).maybeSingle();
}

export async function findDestinationsByKey(locale: Locale, keys: string[]) {
  return createPublicClient()
    .from("destinations")
    .select(
      `key, status,
       hero:media!destinations_hero_media_id_fkey(${MEDIA_COLUMNS}),
       destination_translations!inner(slug, name, summary, best_time_to_visit, locale, is_published)`,
    )
    .in("key", keys)
    .eq("status", "published")
    .eq("destination_translations.locale", locale)
    .eq("destination_translations.is_published", true);
}

export async function findTravelStyles(locale: Locale) {
  return createPublicClient()
    .from("travel_styles")
    .select(
      `key, status, sort_order,
       hero:media!travel_styles_hero_media_id_fkey(${MEDIA_COLUMNS}),
       travel_style_translations!inner(slug, name, description, locale, is_published)`,
    )
    .eq("status", "published")
    .eq("travel_style_translations.locale", locale)
    .eq("travel_style_translations.is_published", true)
    .order("sort_order")
    .limit(4);
}

/** Approved, featured reviews, newest first (never `booking_id`). */
export async function findFeaturedReviews() {
  return createPublicClient()
    .from("reviews")
    .select("id, author_name, author_country, rating, title, content, locale, is_verified, created_at")
    .eq("status", "approved")
    .eq("is_featured", true)
    .order("created_at", { ascending: false })
    .limit(10);
}

export async function findLatestPosts(locale: Locale, limit: number) {
  return createPublicClient()
    .from("posts")
    .select(
      `id, published_at,
       cover:media!posts_cover_media_id_fkey(${MEDIA_COLUMNS}),
       post_translations!inner(slug, title, excerpt, locale, is_published)`,
    )
    .eq("status", "published")
    .eq("post_translations.locale", locale)
    .eq("post_translations.is_published", true)
    .order("published_at", { ascending: false })
    .limit(limit);
}
