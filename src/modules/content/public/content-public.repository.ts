import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import { MEDIA_COLUMNS } from "@/modules/catalog/public/tour-public.repository";
import type { Locale } from "@/modules/catalog/public/types";

/**
 * Public journal, page and review reads as anon (Phase 3 spec decision 2): RLS returns published
 * posts and pages, translations with `is_published`, every topic and approved reviews only.
 * Explicit columns, never `reviews.booking_id`.
 */

const PAGE_COLUMNS = "page_id, locale, slug, title, content, seo_title, seo_description, pages!inner(key, status, updated_at)";

export async function findPageByKey(locale: Locale, key: string) {
  return createPublicClient()
    .from("page_translations")
    .select(PAGE_COLUMNS)
    .eq("locale", locale)
    .eq("is_published", true)
    .eq("pages.key", key)
    .eq("pages.status", "published")
    .maybeSingle();
}

export async function findPageBySlug(locale: Locale, slug: string) {
  return createPublicClient()
    .from("page_translations")
    .select(PAGE_COLUMNS)
    .eq("locale", locale)
    .eq("slug", slug)
    .eq("is_published", true)
    .eq("pages.status", "published")
    .maybeSingle();
}

export async function findPageBySlugInOtherLocale(locale: Locale, slug: string) {
  return createPublicClient()
    .from("page_translations")
    .select("page_id")
    .neq("locale", locale)
    .eq("slug", slug)
    .eq("is_published", true)
    .limit(1)
    .maybeSingle();
}

/** Published translations of some pages (slugs per language; the policy links and alternates). */
export async function findPageTranslations(keys: readonly string[]) {
  return createPublicClient()
    .from("page_translations")
    .select("page_id, locale, slug, title, pages!inner(key, status)")
    .eq("is_published", true)
    .eq("pages.status", "published")
    .in("pages.key", keys as string[]);
}

const POST_LIST_COLUMNS = `id, published_at, category_id,
  cover:media!posts_cover_media_id_fkey(${MEDIA_COLUMNS}),
  post_translations!inner(slug, title, excerpt, locale, is_published)`;

/**
 * Now, for "published by" filters: an article whose `published_at` is in the future is scheduled,
 * not public yet (like `search_site`). The pages are cached for up to an hour, so a scheduled
 * article can appear up to that much later.
 */
const now = () => new Date().toISOString();

export async function findPosts(locale: Locale, options: { categoryId?: string; excludeId?: string; limit: number }) {
  let query = createPublicClient()
    .from("posts")
    .select(POST_LIST_COLUMNS)
    .eq("status", "published")
    .lte("published_at", now())
    .eq("post_translations.locale", locale)
    .eq("post_translations.is_published", true)
    .order("published_at", { ascending: false })
    .limit(options.limit);
  if (options.categoryId) query = query.eq("category_id", options.categoryId);
  if (options.excludeId) query = query.neq("id", options.excludeId);
  return query;
}

export async function findPostBySlug(locale: Locale, slug: string) {
  return createPublicClient()
    .from("post_translations")
    .select(
      `post_id, slug, title, excerpt, content, seo_title, seo_description,
       posts!inner(id, status, category_id, published_at, updated_at,
         cover:media!posts_cover_media_id_fkey(${MEDIA_COLUMNS}))`,
    )
    .eq("locale", locale)
    .eq("slug", slug)
    .eq("is_published", true)
    .eq("posts.status", "published")
    .lte("posts.published_at", now())
    .maybeSingle();
}

export async function findPostBySlugInOtherLocale(locale: Locale, slug: string) {
  return createPublicClient()
    .from("post_translations")
    .select("post_id")
    .neq("locale", locale)
    .eq("slug", slug)
    .eq("is_published", true)
    .limit(1)
    .maybeSingle();
}

export async function findPostSlugs(postId: string) {
  return createPublicClient().from("post_translations").select("locale, slug").eq("post_id", postId).eq("is_published", true);
}

export async function listPostSlugs(locale: Locale) {
  return createPublicClient()
    .from("post_translations")
    .select("slug, posts!inner(status, published_at)")
    .eq("locale", locale)
    .eq("is_published", true)
    .eq("posts.status", "published")
    .lte("posts.published_at", now())
    .limit(1000);
}

/** Every topic with its translations (topics have no publish flag; empty ones are hidden by the service). */
export async function findTopics() {
  return createPublicClient()
    .from("post_categories")
    .select("id, sort_order, post_category_translations(locale, slug, name)")
    .order("sort_order");
}

/** Published article counts per topic in one language. */
export async function findPostCategoryIds(locale: Locale) {
  return createPublicClient()
    .from("posts")
    .select("category_id, post_translations!inner(locale, is_published)")
    .eq("status", "published")
    .lte("published_at", now())
    .eq("post_translations.locale", locale)
    .eq("post_translations.is_published", true)
    .limit(5000);
}

/** Approved reviews, newest first, with the reviewed tour (never `booking_id`). */
export async function findApprovedReviews(limit: number) {
  return createPublicClient()
    .from("reviews")
    .select(
      "id, author_name, author_country, rating, title, content, locale, travel_date, is_verified, created_at, tours(id, tour_translations(locale, slug, title))",
    )
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);
}

/** Count and average of every approved review (for the summary). */
export async function findReviewRatings() {
  return createPublicClient().from("reviews").select("rating").eq("status", "approved").limit(10000);
}
