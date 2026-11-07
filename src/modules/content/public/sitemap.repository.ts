import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

/**
 * Published journal articles and pages with their last change, for sitemap.xml (Phase 3 spec
 * step 19). Read as anon; scheduled articles (`published_at` in the future) are left out, as on
 * the journal. At most 1,000 rows per query (see the catalog sitemap repository).
 */

export async function listPostEntries() {
  return createPublicClient()
    .from("post_translations")
    .select("locale, slug, posts!inner(status, published_at, updated_at)")
    .eq("is_published", true)
    .eq("posts.status", "published")
    .lte("posts.published_at", new Date().toISOString())
    .limit(1000);
}

export async function listPageEntries() {
  return createPublicClient()
    .from("page_translations")
    .select("locale, slug, pages!inner(key, status, updated_at)")
    .eq("is_published", true)
    .eq("pages.status", "published")
    .limit(1000);
}
