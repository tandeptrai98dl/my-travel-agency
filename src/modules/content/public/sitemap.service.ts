import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { newest, type SitemapEntry } from "@/lib/sitemap";
import type { Locale } from "@/modules/catalog/public/types";

import { POLICY_PAGE_KEYS } from "../content.schemas";
import { getTopicSlugs } from "./content-public.service";
import * as repo from "./sitemap.repository";

/**
 * Content entries of sitemap.xml (Phase 3 spec step 19): fixed pages, about and FAQ, policies,
 * the journal, its articles and topics, per language and only where they render. Cached with
 * the tags the content admin refreshes; errors throw (the route answers 503).
 */

const POSTS_TAG = "posts";
const PAGES_TAG = "pages";
const LOCALES: Locale[] = ["vi", "en"];

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what} failed: ${error.message}`);
}

const isPolicy = (key: string) => (POLICY_PAGE_KEYS as readonly string[]).includes(key);

/** Home, listings, about, reviews, contact, FAQ and the policies. */
export async function getPageSitemap(): Promise<SitemapEntry[]> {
  "use cache";
  cacheTag(PAGES_TAG);
  cacheLife("hours");
  const { data, error } = await repo.listPageEntries();
  if (error) fail("page sitemap", error);
  const fixed = LOCALES.flatMap((locale) =>
    (["/", "/tours", "/destinations", "/reviews", "/contact"] as const).map((href) => ({ path: getPathname({ locale, href }), lastModified: null })),
  );
  const pages = (data ?? []).flatMap((row) => {
    const { locale } = row;
    if (!isLocale(locale)) return [];
    const key = row.pages.key;
    const path =
      key === "about" || key === "faq"
        ? getPathname({ locale, href: key === "about" ? "/about" : "/faq" })
        : isPolicy(key)
          ? getPathname({ locale, href: { pathname: "/policies/[slug]", params: { slug: row.slug } } })
          : null;
    return path ? [{ path, lastModified: row.pages.updated_at }] : [];
  });
  return [...fixed, ...pages];
}

/** The journal, its articles and its topics (a topic only where it has articles). */
export async function getJournalSitemap(): Promise<SitemapEntry[]> {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");
  const [{ data, error }, ...topics] = await Promise.all([repo.listPostEntries(), ...LOCALES.map((l) => getTopicSlugs(l))]);
  if (error) fail("journal sitemap", error);
  const posts = (data ?? []).flatMap((row) =>
    isLocale(row.locale)
      ? [{ locale: row.locale, path: getPathname({ locale: row.locale, href: { pathname: "/journal/[slug]", params: { slug: row.slug } } }), lastModified: newest(row.posts.updated_at, row.posts.published_at) }]
      : [],
  );
  return [
    ...LOCALES.map((locale) => ({ path: getPathname({ locale, href: "/journal" }), lastModified: newest(...posts.filter((p) => p.locale === locale).map((p) => p.lastModified)) })),
    ...posts.map(({ path, lastModified }) => ({ path, lastModified })),
    ...LOCALES.flatMap((locale, i) =>
      topics[i].map((slug) => ({ path: getPathname({ locale, href: { pathname: "/journal/topics/[slug]", params: { slug } } }), lastModified: null })),
    ),
  ];
}
