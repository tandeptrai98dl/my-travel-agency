import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { getPathname } from "@/i18n/navigation";
import type { IsoDate } from "@/lib/dates";
import type { ImageData } from "@/lib/images";
import { richTextIsEmpty } from "@/lib/rich-text";
import { REVIEWS_TAG, TOURS_TAG } from "@/modules/catalog/cache-tags";
import { toImage } from "@/modules/catalog/public/tour-public.mapping";
import type { Locale, LocaleLinks } from "@/modules/catalog/public/types";

import { POLICY_PAGE_KEYS, type PageKey } from "../content.schemas";
import {
  type JournalCard,
  type PublicReview,
  ratingSummary,
  type ReviewRow,
  type Topic,
  toJournalCards,
  toPublicReviews,
  toTopics,
  type TopicRow,
  vietnamDate,
} from "./content-public.mapping";
import * as repo from "./content-public.repository";
import { type ContentMedia, contentMediaMap } from "./rich-media";

/** Public journal, static pages and reviews (Phase 3 spec PR K; decisions 2–7, 12, 15). */

/** Same tags the content admin refreshes (content.service.ts). */
const POSTS_TAG = "posts";
const PAGES_TAG = "pages";
const LOCALES: Locale[] = ["vi", "en"];
const FAILED = { stale: 30, revalidate: 30, expire: 300 } as const;

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what} failed: ${error.message}`);
}

export type PageResult<T> = { kind: "found"; page: T } | { kind: "redirect"; slug: string } | { kind: "missing" };

// ---------------------------------------------------------------------------------------------
// Static pages

export type PolicyKey = (typeof POLICY_PAGE_KEYS)[number];
export type PolicyLink = { key: PolicyKey; title: string; href: string };

/**
 * The policy pages published in one language, in a fixed order, with their real per-language
 * paths (decision 15): the footer and the cookie banner link these. Cached with the `pages` tag;
 * empty on failure, so the footer still renders.
 */
export async function getPolicyLinks(locale: Locale): Promise<PolicyLink[]> {
  "use cache";
  cacheTag(PAGES_TAG);
  cacheLife("hours");
  try {
    const { data, error } = await repo.findPageTranslations(POLICY_PAGE_KEYS);
    if (error) fail("policy links", error);
    const rows = (data ?? []).filter((row) => row.locale === locale);
    return POLICY_PAGE_KEYS.flatMap((key) => {
      const row = rows.find((item) => item.pages.key === key);
      return row
        ? [{ key, title: row.title, href: getPathname({ locale, href: { pathname: "/policies/[slug]", params: { slug: row.slug } } }) }]
        : [];
    });
  } catch (error) {
    console.error("getPolicyLinks failed", error instanceof Error ? error.message : error);
    cacheLife(FAILED);
    return [];
  }
}

export type StaticPage = {
  key: PageKey;
  title: string;
  content: unknown | null;
  contentMedia: Record<string, ContentMedia>;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: IsoDate | null;
  alternates: LocaleLinks;
};

type FixedKey = "about" | "faq";
const FIXED_PATHS: Record<FixedKey, "/about" | "/faq"> = { about: "/about", faq: "/faq" };

type PageRow = NonNullable<Awaited<ReturnType<typeof repo.findPageByKey>>["data"]>;

async function assemblePage(row: PageRow, alternates: LocaleLinks): Promise<StaticPage> {
  const content = richTextIsEmpty(row.content) ? null : row.content;
  return {
    key: row.pages.key as PageKey,
    title: row.title,
    content,
    contentMedia: content ? await contentMediaMap(content) : {},
    seoTitle: row.seo_title?.trim() || null,
    seoDescription: row.seo_description?.trim() || null,
    updatedAt: vietnamDate(row.pages.updated_at),
    alternates,
  };
}

/** About or FAQ at their fixed routes; null when not published in this language (404). */
export async function getFixedPage(locale: Locale, key: FixedKey): Promise<StaticPage | null> {
  "use cache";
  cacheTag(PAGES_TAG);
  cacheLife("hours");
  const [{ data, error }, translations] = await Promise.all([repo.findPageByKey(locale, key), repo.findPageTranslations([key])]);
  if (error) fail(`page ${key}`, error);
  if (translations.error) fail(`page ${key} languages`, translations.error);
  if (!data) return null;
  const published = new Set((translations.data ?? []).map((row) => row.locale));
  const alternates = Object.fromEntries(
    LOCALES.map((l) => [
      l,
      published.has(l)
        ? { href: getPathname({ locale: l, href: FIXED_PATHS[key] }), available: true }
        : { href: getPathname({ locale: l, href: "/" }), available: false },
    ]),
  ) as LocaleLinks;
  return assemblePage(data, alternates);
}

function slugLinks(
  pathname: "/policies/[slug]" | "/journal/[slug]" | "/journal/topics/[slug]",
  slugs: { locale: string; slug: string }[],
  fallback: "/" | "/journal",
): LocaleLinks {
  return Object.fromEntries(
    LOCALES.map((locale) => {
      const slug = slugs.find((row) => row.locale === locale)?.slug;
      return [
        locale,
        slug
          ? { href: getPathname({ locale, href: { pathname, params: { slug } } }), available: true }
          : { href: getPathname({ locale, href: fallback }), available: false },
      ];
    }),
  ) as LocaleLinks;
}

const isPolicy = (key: string): key is PolicyKey => (POLICY_PAGE_KEYS as readonly string[]).includes(key);

/** A policy page (terms, privacy, cancellation, payment) by its translation slug. */
export async function getPolicyPage(locale: Locale, slug: string): Promise<PageResult<StaticPage>> {
  "use cache";
  cacheTag(PAGES_TAG);
  cacheLife("hours");
  const { data, error } = await repo.findPageBySlug(locale, slug);
  if (error) fail("policy page", error);
  const translations = await repo.findPageTranslations(POLICY_PAGE_KEYS);
  if (translations.error) fail("policy languages", translations.error);
  if (!data) {
    const other = await repo.findPageBySlugInOtherLocale(locale, slug);
    if (other.error) fail("policy by other slug", other.error);
    const mine = other.data && (translations.data ?? []).find((row) => row.page_id === other.data!.page_id && row.locale === locale);
    return mine ? { kind: "redirect", slug: mine.slug } : { kind: "missing" };
  }
  if (!isPolicy(data.pages.key)) return { kind: "missing" };
  const slugs = (translations.data ?? []).filter((row) => row.page_id === data.page_id);
  return { kind: "found", page: await assemblePage(data, slugLinks("/policies/[slug]", slugs, "/")) };
}

export async function getPolicySlugs(locale: Locale): Promise<string[]> {
  "use cache";
  cacheTag(PAGES_TAG);
  cacheLife("hours");
  try {
    const { data, error } = await repo.findPageTranslations(POLICY_PAGE_KEYS);
    if (error) fail("policy slugs", error);
    return (data ?? []).filter((row) => row.locale === locale).map((row) => row.slug);
  } catch (error) {
    console.error("getPolicySlugs failed", error instanceof Error ? error.message : error);
    cacheLife(FAILED);
    return [];
  }
}

// ---------------------------------------------------------------------------------------------
// Journal

async function loadTopics(locale: Locale): Promise<Topic[]> {
  const [topics, categories] = await Promise.all([repo.findTopics(), repo.findPostCategoryIds(locale)]);
  if (topics.error) fail("topics", topics.error);
  if (categories.error) fail("topic counts", categories.error);
  return toTopics((topics.data ?? []) as TopicRow[], (categories.data ?? []).map((row) => row.category_id), locale);
}

async function loadCards(locale: Locale, topics: Topic[], options: Parameters<typeof repo.findPosts>[1]) {
  const { data, error } = await repo.findPosts(locale, options);
  if (error) fail("articles", error);
  return toJournalCards(data ?? [], topics, locale);
}

export type JournalIndex = { posts: JournalCard[]; topics: Topic[] };

/** The newest articles of one language (up to 24) and the topics that have articles in it. */
export async function getJournalIndex(locale: Locale): Promise<JournalIndex> {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");
  const topics = await loadTopics(locale);
  return { posts: await loadCards(locale, topics, { limit: 24 }), topics };
}

export type PostPage = {
  id: string;
  title: string;
  excerpt: string | null;
  content: unknown;
  contentMedia: Record<string, ContentMedia>;
  seoTitle: string | null;
  seoDescription: string | null;
  image: ImageData | null;
  publishedAt: IsoDate | null;
  updatedAt: IsoDate | null;
  topic: { slug: string; name: string } | null;
  related: JournalCard[];
  alternates: LocaleLinks;
};

/** One article by slug, with its images, topic, up to three related articles and alternates. */
export async function getPostPage(locale: Locale, slug: string): Promise<PageResult<PostPage>> {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");
  const { data, error } = await repo.findPostBySlug(locale, slug);
  if (error) fail("article", error);
  if (!data) {
    const other = await repo.findPostBySlugInOtherLocale(locale, slug);
    if (other.error) fail("article by other slug", other.error);
    if (!other.data) return { kind: "missing" };
    const slugs = await repo.findPostSlugs(other.data.post_id);
    if (slugs.error) fail("article slugs", slugs.error);
    const mine = slugs.data?.find((row) => row.locale === locale);
    return mine ? { kind: "redirect", slug: mine.slug } : { kind: "missing" };
  }
  const post = data.posts;
  cacheTag(`post:${post.id}`);
  const topics = await loadTopics(locale);
  const topic = post.category_id ? topics.find((item) => item.id === post.category_id) ?? null : null;
  const [slugs, contentMedia, sameTopic] = await Promise.all([
    repo.findPostSlugs(post.id),
    contentMediaMap(data.content),
    topic ? loadCards(locale, topics, { categoryId: topic.id, excludeId: post.id, limit: 3 }) : Promise.resolve([]),
  ]);
  if (slugs.error) fail("article slugs", slugs.error);
  const related =
    sameTopic.length >= 3 ? sameTopic : [...sameTopic, ...(await loadCards(locale, topics, { excludeId: post.id, limit: 6 }))]
      .filter((card, index, all) => all.findIndex((item) => item.id === card.id) === index)
      .slice(0, 3);
  return {
    kind: "found",
    page: {
      id: post.id,
      title: data.title,
      excerpt: data.excerpt?.trim() || null,
      content: data.content,
      contentMedia,
      seoTitle: data.seo_title?.trim() || null,
      seoDescription: data.seo_description?.trim() || null,
      image: toImage(post.cover, locale),
      publishedAt: vietnamDate(post.published_at),
      updatedAt: vietnamDate(post.updated_at),
      topic: topic ? { slug: topic.slug, name: topic.name } : null,
      related,
      alternates: slugLinks("/journal/[slug]", slugs.data ?? [], "/journal"),
    },
  };
}

export async function getPostSlugs(locale: Locale): Promise<string[]> {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");
  try {
    const { data, error } = await repo.listPostSlugs(locale);
    if (error) fail("article slugs", error);
    return (data ?? []).map((row) => row.slug);
  } catch (error) {
    console.error("getPostSlugs failed", error instanceof Error ? error.message : error);
    cacheLife(FAILED);
    return [];
  }
}

export type TopicPage = { topic: Topic; posts: JournalCard[]; topics: Topic[]; alternates: LocaleLinks };

/**
 * One topic by slug with its articles. A topic with no published article in this language is
 * missing (no empty pages); a slug of the other language redirects.
 */
export async function getTopicPage(locale: Locale, slug: string): Promise<PageResult<TopicPage>> {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");
  const [{ data, error }, topics] = await Promise.all([repo.findTopics(), loadTopics(locale)]);
  if (error) fail("topics", error);
  const rows = (data ?? []) as TopicRow[];
  const topic = topics.find((item) => item.slug === slug);
  if (!topic) {
    const row = rows.find((item) => item.post_category_translations.some((t) => t.slug === slug && t.locale !== locale));
    const mine = row && topics.find((item) => item.id === row.id);
    return mine ? { kind: "redirect", slug: mine.slug } : { kind: "missing" };
  }
  const [posts, other] = await Promise.all([
    loadCards(locale, topics, { categoryId: topic.id, limit: 48 }),
    Promise.all(LOCALES.filter((l) => l !== locale).map(async (l) => [l, await loadTopics(l)] as const)),
  ]);
  // The other language is offered only when the topic has articles there too.
  const slugs = [
    { locale, slug: topic.slug },
    ...other.flatMap(([l, list]) => {
      const found = list.find((item) => item.id === topic.id);
      return found ? [{ locale: l, slug: found.slug }] : [];
    }),
  ];
  return { kind: "found", page: { topic, posts, topics, alternates: slugLinks("/journal/topics/[slug]", slugs, "/journal") } };
}

export async function getTopicSlugs(locale: Locale): Promise<string[]> {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");
  try {
    return (await loadTopics(locale)).map((topic) => topic.slug);
  } catch (error) {
    console.error("getTopicSlugs failed", error instanceof Error ? error.message : error);
    cacheLife(FAILED);
    return [];
  }
}

// ---------------------------------------------------------------------------------------------
// Reviews

export type ReviewsPage = { count: number; average: number | null; reviews: PublicReview[] };

/** Approved reviews, newest first (up to 60), with the count and average of all of them. */
export async function getReviewsPage(locale: Locale): Promise<ReviewsPage> {
  "use cache";
  cacheTag(REVIEWS_TAG, TOURS_TAG);
  cacheLife("hours");
  const [list, ratings] = await Promise.all([repo.findApprovedReviews(60), repo.findReviewRatings()]);
  if (list.error) fail("reviews", list.error);
  if (ratings.error) fail("review ratings", ratings.error);
  return { ...ratingSummary((ratings.data ?? []).map((row) => row.rating)), reviews: toPublicReviews((list.data ?? []) as ReviewRow[], locale) };
}
