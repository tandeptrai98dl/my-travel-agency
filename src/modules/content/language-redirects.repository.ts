import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

import { POLICY_PAGE_KEYS } from "./content.schemas";
import { liveTopicRows } from "./language-redirects";

/**
 * Published slugs per language of every content type with per-language URLs, for the
 * other-language redirects in Redis (`language-redirects.service.ts`). Read as anon, so RLS returns
 * only what the public site shows. At most 1,000 rows per type (paginate when catalogs grow).
 */

const client = () => createPublicClient();

export const listTourSlugs = () =>
  client().from("tour_translations").select("id:tour_id, locale, slug, tours!inner(status)").eq("is_published", true).eq("tours.status", "published").limit(1000);

export const listDestinationSlugs = () =>
  client()
    .from("destination_translations")
    .select("id:destination_id, locale, slug, destinations!inner(status)")
    .eq("is_published", true)
    .eq("destinations.status", "published")
    .limit(1000);

export const listTravelStyleSlugs = () =>
  client()
    .from("travel_style_translations")
    .select("id:travel_style_id, locale, slug, travel_styles!inner(status)")
    .eq("is_published", true)
    .eq("travel_styles.status", "published")
    .limit(1000);

export const listPostSlugs = () =>
  client()
    .from("post_translations")
    .select("id:post_id, locale, slug, posts!inner(status, published_at)")
    .eq("is_published", true)
    .eq("posts.status", "published")
    .lte("posts.published_at", new Date().toISOString())
    .limit(1000);

/** Topic slugs per language, only where the topic has a published article in that language. */
export async function listTopicSlugs() {
  const now = new Date().toISOString();
  const [topics, posts] = await Promise.all([
    client().from("post_category_translations").select("id:category_id, locale, slug").limit(1000),
    client()
      .from("posts")
      .select("category_id, post_translations!inner(locale)")
      .eq("status", "published")
      .lte("published_at", now)
      .eq("post_translations.is_published", true)
      .limit(5000),
  ]);
  const error = topics.error ?? posts.error;
  if (error) return { data: null, error };
  return { data: liveTopicRows(topics.data ?? [], posts.data ?? []), error: null };
}

export const listPolicySlugs = () =>
  client()
    .from("page_translations")
    .select("id:page_id, locale, slug, pages!inner(key, status)")
    .eq("is_published", true)
    .eq("pages.status", "published")
    .in("pages.key", [...POLICY_PAGE_KEYS])
    .limit(1000);
