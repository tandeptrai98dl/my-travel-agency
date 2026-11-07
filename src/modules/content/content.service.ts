import "server-only";

import { updateTag } from "next/cache";
import { z } from "zod";

import { getPathname } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { emptyRichText, richTextMediaIds } from "@/lib/rich-text";
import { readAlt } from "@/modules/media/media.schemas";
import { getMediaUrl } from "@/modules/media/media.service";
import { scheduleLanguageRedirects } from "@/modules/content/language-redirects.service";

import * as repo from "./content.repository";
import { syncSlugRedirect } from "./redirects.service";
import {
  type CategoryInput,
  type CategoryValues,
  CONTENT_LOCALES,
  type ContentKind,
  type ContentLocale,
  type PageInput,
  PAGE_KEYS,
  type PageKey,
  type PageValues,
  POLICY_PAGE_KEYS,
  type PostInput,
  POSTS_PAGE_SIZE,
  type PostValues,
} from "./content.schemas";

/** Cache tags for public reads (decision 9): journal lists and categories, one article, pages. */
export const POSTS_TAG = "posts";
export const postTag = (id: string) => `post:${id}`;
export const PAGES_TAG = "pages";
export const pageTag = (key: string) => `page:${key}`;

export type SaveResult = { ok: true; id: string } | { ok: false; error: string; field?: string };
export type DeleteResult = { ok: true } | { ok: false; error: "in_use" | "published" | "not_found" | "failed" };

type DbError = { code?: string; message?: string; details?: string } | null;

/** Postgres error → form error (unique slugs and the *_content_rules.sql triggers). */
export function mapContentError(error: DbError, locale: ContentLocale = "vi"): { ok: false; error: string; field?: string } {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`;
  const at = `translations.${locale}`;
  if (error?.code === "23505" && text.includes("slug")) return { ok: false, error: "slug_taken", field: `${at}.slug` };
  if (error?.code === "23503") return { ok: false, error: "in_use" };
  if (error?.code === "23514") {
    if (text.includes("slug_format")) return { ok: false, error: "slugInvalid", field: `${at}.slug` };
    if (text.includes("title, content and an SEO description")) {
      return { ok: false, error: "requiredToPublish", field: `${at}.isPublished` };
    }
    if (text.includes("images in published content")) return { ok: false, error: "contentImageAlt", field: `${at}.content` };
    if (text.includes("needs a published translation")) return { ok: false, error: "publishNeedsTranslation", field: "status" };
    if (text.includes("cover image")) return { ok: false, error: "publishNeedsCover", field: "coverMediaId" };
    if (text.includes("last published translation")) return { ok: false, error: "lastTranslation", field: `${at}.isPublished` };
  }
  logger.error("content.write_failed", { code: error?.code, message: error?.message });
  return { ok: false, error: "failed" };
}

/** Public path of a translation, for 301s on slug changes (decision 4); null where the slug is not in the URL. */
export function contentPath(kind: ContentKind, locale: ContentLocale, slug: string, key?: string): string | null {
  if (kind === "post") return getPathname({ href: { pathname: "/journal/[slug]", params: { slug } }, locale });
  if (kind === "category") return getPathname({ href: { pathname: "/journal/topics/[slug]", params: { slug } }, locale });
  // About and FAQ have fixed routes; policies are served by slug.
  if (key && (POLICY_PAGE_KEYS as readonly string[]).includes(key)) {
    return getPathname({ href: { pathname: "/policies/[slug]", params: { slug } }, locale });
  }
  return null;
}

/**
 * A published translation serves its path again: a redirect left there by an earlier slug change
 * or removal would shadow it, since the proxy reads Redis before the page (as tours do, #22).
 */
async function clearRedirectFrom(kind: ContentKind, path: string | null) {
  if (!path) return;
  const cleared = await repo.deleteRedirectFrom(path);
  if (cleared.error) logger.error("content.redirect_clear_failed", { kind, message: cleared.error.message });
  else if (cleared.data?.length) await syncSlugRedirect(path);
}

async function redirectIfSlugChanged(
  kind: ContentKind,
  locale: ContentLocale,
  before: { locale: string; slug: string; is_published?: boolean } | undefined,
  nextSlug: string,
  key?: string,
) {
  // Categories have no publish flag: their pages exist as soon as they do.
  if (!before || before.slug === nextSlug || before.is_published === false) return;
  const from = contentPath(kind, locale, before.slug, key);
  const to = contentPath(kind, locale, nextSlug, key);
  if (!from || !to) return;
  const { error } = await repo.saveRedirect(from, to);
  if (error) logger.error("content.redirect_failed", { kind, locale, message: error.message });
  else await syncSlugRedirect(to);
}

export async function isSlugAvailable(input: { kind: ContentKind; locale: ContentLocale; slug: string; excludeId?: string }) {
  await requirePermission("content.manage");
  const { ownerId, error } = await repo.findSlugOwner(input.kind, input.locale, input.slug);
  if (error) throw new Error(`slug lookup failed: ${error.message}`);
  return ownerId === null || ownerId === input.excludeId;
}

// Media ------------------------------------------------------------------------------------------------

export type CoverSummary = { id: string; url: string; alt: string; altComplete: boolean } | null;
export type EditorMedia = Record<string, { url: string; alt: string }>;

type MediaInfo = { id: string; url: string; alt: { vi: string; en: string }; altComplete: boolean };

async function mediaInfo(ids: string[]): Promise<Map<string, MediaInfo>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const { data, error } = await repo.findMediaRows(unique);
  if (error) throw new Error(`media query failed: ${error.message}`);
  return new Map(
    (data ?? []).map((row) => {
      const alt = readAlt(row.alt);
      return [row.id, { id: row.id, url: getMediaUrl(row.path), alt, altComplete: Boolean(alt.vi.trim() && alt.en.trim()) }];
    }),
  );
}

function editorMedia(info: Map<string, MediaInfo>): EditorMedia {
  return Object.fromEntries([...info.values()].map((item) => [item.id, { url: item.url, alt: item.alt.vi || item.alt.en }]));
}

function cover(info: Map<string, MediaInfo>, id: string | null): CoverSummary {
  const item = id ? info.get(id) : undefined;
  return item ? { id: item.id, url: item.url, alt: item.alt.vi || item.alt.en, altComplete: item.altComplete } : null;
}

/**
 * Decision 6, checked before anything is written (the database checks again): images in a
 * language being published need both alt texts, and must still exist.
 */
async function contentImagesProblem(
  translations: Record<ContentLocale, { title: string; content: unknown; isPublished: boolean }>,
): Promise<{ ok: false; error: string; field: string } | null> {
  for (const locale of CONTENT_LOCALES) {
    const t = translations[locale];
    if (!t.title || !t.isPublished) continue;
    const ids = richTextMediaIds(t.content);
    if (ids.length === 0) continue;
    const info = await mediaInfo(ids);
    if (ids.some((id) => !info.get(id)?.altComplete)) {
      return { ok: false, error: "contentImageAlt", field: `translations.${locale}.content` };
    }
  }
  return null;
}

type LocaleState = { exists: boolean; published: boolean };
function localeStates(rows: { locale: string; is_published: boolean }[]): Record<ContentLocale, LocaleState> {
  const state = (locale: ContentLocale) => {
    const row = rows.find((r) => r.locale === locale);
    return { exists: Boolean(row), published: Boolean(row?.is_published) };
  };
  return { vi: state("vi"), en: state("en") };
}

/** The order to save languages in: those becoming published first, so a parent never loses its last one. */
function saveOrder(translations: Record<ContentLocale, { isPublished: boolean }>): ContentLocale[] {
  return [...CONTENT_LOCALES].sort((a, b) => Number(translations[b].isPublished) - Number(translations[a].isPublished));
}

/** PostgREST filter syntax is dropped from free-text search. */
function cleanSearch(q: string) {
  return q.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim();
}

// Posts ------------------------------------------------------------------------------------------------

export type PostListItem = {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  categoryName: string | null;
  locales: Record<ContentLocale, LocaleState>;
  updatedAt: string;
  publishedAt: string | null;
};

export async function listPosts(params: {
  q: string;
  filters: Record<string, string>;
  sort: string;
  dir: "asc" | "desc";
  page: number;
}): Promise<{ items: PostListItem[]; total: number; pageCount: number }> {
  await requirePermission("content.manage");
  const q = cleanSearch(params.q);
  let ids: string[] | null = null;
  if (q) {
    const { data } = await repo.findPostIdsByTitle(q);
    ids = [...new Set((data ?? []).map((row) => row.post_id))];
    if (ids.length === 0) return { items: [], total: 0, pageCount: 1 };
  }
  const from = (params.page - 1) * POSTS_PAGE_SIZE;
  const [{ data, error, count }, categories] = await Promise.all([
    repo.listPostRows({
      ids,
      status: params.filters.status as PostListItem["status"] | undefined,
      // A hand-typed value that is not an id would make Postgres fail; it is ignored instead.
      categoryId: z.uuid().safeParse(params.filters.category).data,
      sort: params.sort,
      ascending: params.dir === "asc",
      range: [from, from + POSTS_PAGE_SIZE - 1],
    }),
    listCategories(),
  ]);
  if (error) throw new Error(`posts query failed: ${error.message}`);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const items = (data ?? []).map((row) => {
    const title = (locale: ContentLocale) => row.post_translations.find((t) => t.locale === locale)?.title;
    return {
      id: row.id,
      title: title("vi") || title("en") || "—",
      status: row.status,
      categoryName: row.category_id ? (names.get(row.category_id) ?? null) : null,
      locales: localeStates(row.post_translations),
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
    };
  });
  const total = count ?? items.length;
  return { items, total, pageCount: Math.max(1, Math.ceil(total / POSTS_PAGE_SIZE)) };
}

const emptyPostTranslation = (): PostInput["translations"]["vi"] => ({
  slug: "",
  title: "",
  excerpt: "",
  content: emptyRichText(),
  seoTitle: "",
  seoDescription: "",
  isPublished: false,
});

export type PostEditorData = { values: PostInput; cover: CoverSummary; media: EditorMedia };

export function newPostValues(): PostInput {
  return {
    status: "draft",
    categoryId: null,
    coverMediaId: null,
    translations: { vi: emptyPostTranslation(), en: emptyPostTranslation() },
  };
}

export async function getPostEditor(id: string): Promise<PostEditorData | null> {
  await requirePermission("content.manage");
  const { data, error } = await repo.findPost(id);
  if (error) throw new Error(`post query failed: ${error.message}`);
  if (!data) return null;
  const translation = (locale: ContentLocale): PostInput["translations"]["vi"] => {
    const row = data.post_translations.find((t) => t.locale === locale);
    if (!row) return emptyPostTranslation();
    return {
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt ?? "",
      content: row.content,
      seoTitle: row.seo_title ?? "",
      seoDescription: row.seo_description ?? "",
      isPublished: row.is_published,
    };
  };
  const vi = translation("vi");
  const en = translation("en");
  const info = await mediaInfo([data.cover_media_id ?? "", ...richTextMediaIds(vi.content), ...richTextMediaIds(en.content)]);
  return {
    values: {
      id: data.id,
      status: data.status,
      categoryId: data.category_id,
      coverMediaId: data.cover_media_id,
      translations: { vi, en },
    },
    cover: cover(info, data.cover_media_id),
    media: editorMedia(info),
  };
}

export async function savePost(values: PostValues): Promise<SaveResult> {
  const user = await requirePermission("content.manage");
  const existing = values.id ? (await repo.findPost(values.id)).data : null;
  if (values.id && !existing) return { ok: false, error: "not_found" };
  const publishing = values.status === "published";

  // Removing a whole language is not done by clearing its title (it would drop its text silently).
  for (const locale of CONTENT_LOCALES) {
    if (existing?.post_translations.some((row) => row.locale === locale) && !values.translations[locale].title) {
      return { ok: false, error: "keepLanguage", field: `translations.${locale}.title` };
    }
  }
  if (publishing && values.coverMediaId) {
    const info = await mediaInfo([values.coverMediaId]);
    if (!info.get(values.coverMediaId)?.altComplete) return { ok: false, error: "publishNeedsCover", field: "coverMediaId" };
  }
  const imageProblem = await contentImagesProblem(values.translations);
  if (imageProblem) return imageProblem;

  // Publishing: content first, status last. Unpublishing: status first, then content.
  const firstStatus = publishing ? (existing?.status ?? "draft") : values.status;
  const base = { category_id: values.categoryId, cover_media_id: values.coverMediaId, status: firstStatus };
  const saved = existing
    ? await repo.updatePost(existing.id, base)
    : await repo.insertPost({ ...base, status: publishing ? "draft" : values.status, author_id: user.id });
  if (saved.error || !saved.data) return mapContentError(saved.error);
  const id = saved.data.id;
  const fail = async (result: SaveResult) => {
    if (existing) refreshPost(id);
    else await repo.deletePostRow(id);
    return result;
  };

  for (const locale of saveOrder(values.translations)) {
    const t = values.translations[locale];
    if (!t.title) continue;
    const before = existing?.post_translations.find((row) => row.locale === locale);
    const { error } = await repo.upsertPostTranslation({
      post_id: id,
      locale,
      slug: t.slug,
      title: t.title,
      excerpt: t.excerpt,
      content: t.content,
      seo_title: t.seoTitle,
      seo_description: t.seoDescription,
      is_published: t.isPublished,
    });
    if (error) return fail(mapContentError(error, locale));
    if (t.isPublished) await clearRedirectFrom("post", contentPath("post", locale, t.slug));
    await redirectIfSlugChanged("post", locale, before, t.slug);
  }

  if (firstStatus !== values.status) {
    const last = await repo.updatePost(id, {
      status: values.status,
      ...(publishing && !existing?.published_at ? { published_at: new Date().toISOString() } : {}),
    });
    if (last.error) return fail(mapContentError(last.error));
  }
  refreshPost(id);
  return { ok: true, id };
}

function refreshPost(id: string) {
  updateTag(POSTS_TAG);
  updateTag(postTag(id));
  scheduleLanguageRedirects();
}

/** Drafts and archived articles only: a published one is unpublished first (its URL would break). */
export async function deletePost(id: string): Promise<DeleteResult> {
  await requirePermission("content.manage");
  const { data: existing } = await repo.findPost(id);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.status === "published") return { ok: false, error: "published" };
  const { data, error } = await repo.deletePostRow(id);
  // 23514: published meanwhile (guard_post_delete).
  if (error) return { ok: false, error: error.code === "23503" ? "in_use" : error.code === "23514" ? "published" : "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };
  refreshPost(id);
  return { ok: true };
}

// Categories ---------------------------------------------------------------------------------------------

export type CategoryItem = { id: string; name: string; sortOrder: number; locales: Record<ContentLocale, LocaleState> };

export async function listCategories(): Promise<CategoryItem[]> {
  await requirePermission("content.manage");
  const { data, error } = await repo.listCategoryRows();
  if (error) throw new Error(`categories query failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const name = (locale: ContentLocale) => row.post_category_translations.find((t) => t.locale === locale)?.name;
    return {
      id: row.id,
      name: name("vi") || name("en") || "—",
      sortOrder: row.sort_order,
      // Categories have no publish flag: a translation is live as soon as it exists.
      locales: localeStates(row.post_category_translations.map((t) => ({ locale: t.locale, is_published: true }))),
    };
  });
}

export function newCategoryValues(): CategoryInput {
  return { sortOrder: 0, translations: { vi: { slug: "", name: "" }, en: { slug: "", name: "" } } };
}

export async function getCategory(id: string): Promise<CategoryInput | null> {
  await requirePermission("content.manage");
  const { data, error } = await repo.findCategory(id);
  if (error) throw new Error(`category query failed: ${error.message}`);
  if (!data) return null;
  const translation = (locale: ContentLocale) => {
    const row = data.post_category_translations.find((t) => t.locale === locale);
    return { slug: row?.slug ?? "", name: row?.name ?? "" };
  };
  return { id: data.id, sortOrder: data.sort_order, translations: { vi: translation("vi"), en: translation("en") } };
}

export async function saveCategory(values: CategoryValues): Promise<SaveResult> {
  await requirePermission("content.manage");
  const existing = values.id ? (await repo.findCategory(values.id)).data : null;
  if (values.id && !existing) return { ok: false, error: "not_found" };
  const saved = existing
    ? await repo.updateCategory(existing.id, { sort_order: values.sortOrder })
    : await repo.insertCategory({ sort_order: values.sortOrder });
  if (saved.error || !saved.data) return mapContentError(saved.error);
  const id = saved.data.id;
  for (const locale of CONTENT_LOCALES) {
    const t = values.translations[locale];
    const before = existing?.post_category_translations.find((row) => row.locale === locale);
    const { error } = t.name
      ? await repo.upsertCategoryTranslation({ category_id: id, locale, slug: t.slug, name: t.name })
      : await repo.deleteCategoryTranslation(id, locale);
    if (error) {
      if (!existing) await repo.deleteCategoryRow(id);
      else updateTag(POSTS_TAG);
      return mapContentError(error, locale);
    }
    if (t.name) {
      // Topics have no publish flag: their page exists as soon as they do.
      await clearRedirectFrom("category", contentPath("category", locale, t.slug));
      await redirectIfSlugChanged("category", locale, before, t.slug);
    }
  }
  updateTag(POSTS_TAG);
  scheduleLanguageRedirects();
  return { ok: true, id };
}

/** Only categories no article uses. */
export async function deleteCategory(id: string): Promise<DeleteResult> {
  await requirePermission("content.manage");
  const uses = await repo.countCategoryPosts(id);
  if (uses.error) return { ok: false, error: "failed" };
  if (uses.count > 0) return { ok: false, error: "in_use" };
  const { data, error } = await repo.deleteCategoryRow(id);
  if (error) return { ok: false, error: error.code === "23503" ? "in_use" : "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };
  updateTag(POSTS_TAG);
  return { ok: true };
}

// Pages ----------------------------------------------------------------------------------------------------

export type PageListItem = {
  key: PageKey;
  title: string | null;
  status: "draft" | "published" | "archived" | null;
  locales: Record<ContentLocale, LocaleState>;
  updatedAt: string | null;
};

/** The fixed pages, whether or not they have been written yet. */
export async function listPages(): Promise<PageListItem[]> {
  await requirePermission("content.manage");
  const { data, error } = await repo.listPageRows();
  if (error) throw new Error(`pages query failed: ${error.message}`);
  return PAGE_KEYS.map((key) => {
    const row = data?.find((r) => r.key === key);
    const title = (locale: ContentLocale) => row?.page_translations.find((t) => t.locale === locale)?.title;
    return {
      key,
      title: title("vi") || title("en") || null,
      status: row?.status ?? null,
      locales: localeStates(row?.page_translations ?? []),
      updatedAt: row?.updated_at ?? null,
    };
  });
}

const emptyPageTranslation = (): PageInput["translations"]["vi"] => ({
  slug: "",
  title: "",
  content: emptyRichText(),
  seoTitle: "",
  seoDescription: "",
  isPublished: false,
});

export type PageEditorData = { values: PageInput; pageId: string | null; media: EditorMedia };

export async function getPageEditor(key: PageKey): Promise<PageEditorData> {
  await requirePermission("content.manage");
  const { data, error } = await repo.findPageByKey(key);
  if (error) throw new Error(`page query failed: ${error.message}`);
  const translation = (locale: ContentLocale): PageInput["translations"]["vi"] => {
    const row = data?.page_translations.find((t) => t.locale === locale);
    if (!row) return emptyPageTranslation();
    return {
      slug: row.slug,
      title: row.title,
      content: row.content,
      seoTitle: row.seo_title ?? "",
      seoDescription: row.seo_description ?? "",
      isPublished: row.is_published,
    };
  };
  const vi = translation("vi");
  const en = translation("en");
  const info = await mediaInfo([...richTextMediaIds(vi.content), ...richTextMediaIds(en.content)]);
  return { values: { key, status: data?.status ?? "draft", translations: { vi, en } }, pageId: data?.id ?? null, media: editorMedia(info) };
}

export async function savePage(values: PageValues): Promise<SaveResult> {
  await requirePermission("content.manage");
  const { data: existing } = await repo.findPageByKey(values.key);
  const publishing = values.status === "published";
  for (const locale of CONTENT_LOCALES) {
    if (existing?.page_translations.some((row) => row.locale === locale) && !values.translations[locale].title) {
      return { ok: false, error: "keepLanguage", field: `translations.${locale}.title` };
    }
  }
  const imageProblem = await contentImagesProblem(values.translations);
  if (imageProblem) return imageProblem;

  const firstStatus = publishing ? (existing?.status ?? "draft") : values.status;
  const saved = existing
    ? await repo.updatePage(existing.id, { status: firstStatus })
    : await repo.insertPage({ key: values.key, status: publishing ? "draft" : values.status });
  if (saved.error || !saved.data) return mapContentError(saved.error);
  const id = saved.data.id;
  const refresh = () => {
    updateTag(PAGES_TAG);
    updateTag(pageTag(values.key));
    scheduleLanguageRedirects();
  };

  for (const locale of saveOrder(values.translations)) {
    const t = values.translations[locale];
    if (!t.title) continue;
    const before = existing?.page_translations.find((row) => row.locale === locale);
    const { error } = await repo.upsertPageTranslation({
      page_id: id,
      locale,
      slug: t.slug,
      title: t.title,
      content: t.content,
      seo_title: t.seoTitle,
      seo_description: t.seoDescription,
      is_published: t.isPublished,
    });
    if (error) {
      refresh();
      return mapContentError(error, locale);
    }
    if (t.isPublished) await clearRedirectFrom("page", contentPath("page", locale, t.slug, values.key));
    await redirectIfSlugChanged("page", locale, before, t.slug, values.key);
  }
  if (firstStatus !== values.status) {
    const last = await repo.updatePage(id, { status: values.status });
    if (last.error) {
      refresh();
      return mapContentError(last.error);
    }
  }
  refresh();
  return { ok: true, id };
}
