import { localizedPath } from "@/i18n/paths";

/**
 * Other-language slug redirects (#40 review; Phase 3 spec step 22 known issue): for a page with a
 * published translation in both languages, the other language's slug under this language's prefix
 * (`/en/tours/<vi slug>`) → this language's URL (`/en/tours/<en slug>`), as 301s. Next.js answers
 * these with a prerendered 308, but stores a re-rendered one without its Location header, so the
 * proxy serves them from Redis instead.
 */

export type SlugRow = { id: string; locale: string; slug: string };
export type SlugRoute = "/tours/[slug]" | "/destinations/[slug]" | "/travel-styles/[slug]" | "/journal/[slug]" | "/journal/topics/[slug]" | "/policies/[slug]";

const LOCALES = ["vi", "en"] as const;

export function languagePairs(rows: SlugRow[], route: SlugRoute): [source: string, target: string][] {
  const byId = new Map<string, Partial<Record<(typeof LOCALES)[number], string>>>();
  const taken = { vi: new Set<string>(), en: new Set<string>() };
  for (const row of rows) {
    if (row.locale !== "vi" && row.locale !== "en") continue;
    byId.set(row.id, { ...byId.get(row.id), [row.locale]: row.slug });
    taken[row.locale].add(row.slug);
  }
  const path = (locale: (typeof LOCALES)[number], slug: string) => localizedPath(locale, { pathname: route, params: { slug } });
  const pairs: [string, string][] = [];
  for (const slugs of byId.values()) {
    if (!slugs.vi || !slugs.en || slugs.vi === slugs.en) continue;
    for (const locale of LOCALES) {
      const other = locale === "vi" ? slugs.en : slugs.vi;
      // The other language's slug may be a real page of this language (another entity): it wins.
      if (taken[locale].has(other)) continue;
      pairs.push([path(locale, other), path(locale, slugs[locale]!)]);
    }
  }
  return pairs;
}
