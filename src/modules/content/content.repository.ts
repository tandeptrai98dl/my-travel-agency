import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];

/**
 * Journal and page data access with the staff member's session, after requirePermission().
 * RLS: editor and admin write posts, categories and pages; *_content_rules.sql applies on top.
 */
const db = createClient;

const POST_TRANSLATION_COLUMNS = "id, locale, slug, title, excerpt, content, seo_title, seo_description, is_published";
const PAGE_TRANSLATION_COLUMNS = "id, locale, slug, title, content, seo_title, seo_description, is_published";

// Posts ---------------------------------------------------------------------------------------------

export async function listPostRows(params: {
  ids: string[] | null;
  status?: Tables["posts"]["Row"]["status"];
  categoryId?: string;
  sort: string;
  ascending: boolean;
  range: [number, number];
}) {
  const supabase = await db();
  let query = supabase
    .from("posts")
    .select("id, status, category_id, published_at, updated_at, post_translations(locale, title, is_published)", {
      count: "exact",
    })
    .order(params.sort, { ascending: params.ascending, nullsFirst: false })
    .order("id")
    .range(params.range[0], params.range[1]);
  if (params.ids) query = query.in("id", params.ids);
  if (params.status) query = query.eq("status", params.status);
  if (params.categoryId) query = query.eq("category_id", params.categoryId);
  return query;
}

/** Posts whose title in any language matches (for the list search). */
export async function findPostIdsByTitle(search: string) {
  return (await db()).from("post_translations").select("post_id").ilike("title", `%${search}%`).limit(200);
}

export async function findPost(id: string) {
  return (await db())
    .from("posts")
    .select(`id, status, category_id, cover_media_id, published_at, post_translations(${POST_TRANSLATION_COLUMNS})`)
    .eq("id", id)
    .maybeSingle();
}

export async function insertPost(row: Tables["posts"]["Insert"]) {
  return (await db()).from("posts").insert(row).select("id").single();
}

export async function updatePost(id: string, row: Tables["posts"]["Update"]) {
  return (await db()).from("posts").update(row).eq("id", id).select("id").single();
}

export async function deletePostRow(id: string) {
  return (await db()).from("posts").delete().eq("id", id).select("id");
}

export async function upsertPostTranslation(row: Tables["post_translations"]["Insert"]) {
  return (await db()).from("post_translations").upsert(row, { onConflict: "post_id,locale" });
}

// Categories ------------------------------------------------------------------------------------------

export async function listCategoryRows() {
  return (await db())
    .from("post_categories")
    .select("id, sort_order, post_category_translations(id, locale, slug, name)")
    .order("sort_order")
    .order("id");
}

export async function findCategory(id: string) {
  return (await db())
    .from("post_categories")
    .select("id, sort_order, post_category_translations(id, locale, slug, name)")
    .eq("id", id)
    .maybeSingle();
}

export async function insertCategory(row: Tables["post_categories"]["Insert"]) {
  return (await db()).from("post_categories").insert(row).select("id").single();
}

export async function updateCategory(id: string, row: Tables["post_categories"]["Update"]) {
  return (await db()).from("post_categories").update(row).eq("id", id).select("id").single();
}

export async function upsertCategoryTranslation(row: Tables["post_category_translations"]["Insert"]) {
  return (await db()).from("post_category_translations").upsert(row, { onConflict: "category_id,locale" });
}

export async function deleteCategoryTranslation(categoryId: string, locale: "vi" | "en") {
  return (await db()).from("post_category_translations").delete().eq("category_id", categoryId).eq("locale", locale);
}

export async function countCategoryPosts(id: string) {
  const { count, error } = await (await db())
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  return { count: count ?? 0, error };
}

export async function deleteCategoryRow(id: string) {
  return (await db()).from("post_categories").delete().eq("id", id).select("id");
}

// Pages -------------------------------------------------------------------------------------------------

export async function listPageRows() {
  return (await db()).from("pages").select("id, key, status, updated_at, page_translations(locale, title, is_published)");
}

export async function findPageByKey(key: string) {
  return (await db())
    .from("pages")
    .select(`id, key, status, page_translations(${PAGE_TRANSLATION_COLUMNS})`)
    .eq("key", key)
    .maybeSingle();
}

export async function insertPage(row: Tables["pages"]["Insert"]) {
  return (await db()).from("pages").insert(row).select("id").single();
}

export async function updatePage(id: string, row: Tables["pages"]["Update"]) {
  return (await db()).from("pages").update(row).eq("id", id).select("id").single();
}

export async function upsertPageTranslation(row: Tables["page_translations"]["Insert"]) {
  return (await db()).from("page_translations").upsert(row, { onConflict: "page_id,locale" });
}

// Shared ---------------------------------------------------------------------------------------------------

const SLUG_TABLES = {
  post: { table: "post_translations", owner: "post_id" },
  page: { table: "page_translations", owner: "page_id" },
  category: { table: "post_category_translations", owner: "category_id" },
} as const;

export async function findSlugOwner(kind: keyof typeof SLUG_TABLES, locale: "vi" | "en", slug: string) {
  const { table, owner } = SLUG_TABLES[kind];
  const { data, error } = await (await db()).from(table).select(owner).eq("locale", locale).eq("slug", slug).maybeSingle();
  const row = data as Record<string, string> | null;
  return { ownerId: row ? row[owner] : null, error };
}

export async function findMediaRows(ids: string[]) {
  if (ids.length === 0) return { data: [], error: null };
  return (await db()).from("media").select("id, path, alt, width, height").in("id", ids);
}

/** Drops a redirect away from a path that a published translation now serves again. */
export async function deleteRedirectFrom(path: string) {
  return (await db()).from("redirects").delete().eq("from_path", path).select("id");
}

export async function saveRedirect(fromPath: string, toPath: string) {
  // One transaction (record_slug_redirect, *_review_followups.sql): no half-moved redirects.
  return (await db()).rpc("record_slug_redirect", { source: fromPath, target: toPath });
}

export type PostRow = NonNullable<Awaited<ReturnType<typeof findPost>>["data"]>;
export type PageRow = NonNullable<Awaited<ReturnType<typeof findPageByKey>>["data"]>;
