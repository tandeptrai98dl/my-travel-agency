import { type Locale, isLocale, routing } from "./routing";

/**
 * `generateStaticParams` for a `[slug]` route under `[locale]` (Phase 3 spec decision 4 and step
 * 22): the published slugs of this language, plus those of the other language, so a visit to the
 * other language's slug is prerendered too and its `permanentRedirect()` (or `notFound()` when
 * this language has no published translation) is a real 308 (or 404) instead of a 200 fallback
 * shell. When nothing can be listed (a build during an outage) it returns `sentinel`, which the
 * page renders as a 404, so the build succeeds and pages render on demand.
 */
export async function slugParams(
  locale: string,
  list: (locale: Locale) => Promise<string[]>,
  sentinel: string,
): Promise<{ slug: string }[]> {
  if (!isLocale(locale)) return [{ slug: sentinel }];
  const others = routing.locales.filter((other) => other !== locale);
  const lists = await Promise.all([list(locale), ...others.map(list)]);
  const slugs = [...new Set(lists.flat())];
  return (slugs.length ? slugs : [sentinel]).map((slug) => ({ slug }));
}
