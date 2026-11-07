import { Search } from "lucide-react";
import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { TourGrid } from "@/components/tour/listing/tour-grid";
import { SectionHeading } from "@/components/typography/section-heading";
import { buttonVariants } from "@/components/ui/button-variants";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { formatDate } from "@/lib/dates";
import { siteUrl } from "@/lib/site-url";
import type { Locale } from "@/modules/catalog/public/types";
import { listingHref } from "@/modules/catalog/tour-listing-href";
import { normalizeQuery } from "@/modules/catalog/tour-search-params";
import { type SiteSearchHit, searchSite } from "@/modules/content/public/site-search.service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Never indexed (search results are not pages of their own), links followed. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const [t, raw] = await Promise.all([getTranslations({ locale, namespace: "SiteSearch" }), searchParams]);
  const q = normalizeQuery(first(raw.q));
  return {
    title: q ? t("metaTitleQuery", { q }) : t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: true },
    alternates: { canonical: getPathname({ locale, href: "/search" }) },
  };
}

/** Site search (Phase 3 PR L, spec step 18): tours, destinations and journal articles. */
export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, tDetail] = await Promise.all([
    getTranslations({ locale, namespace: "SiteSearch" }),
    getTranslations({ locale, namespace: "TourDetail" }),
  ]);
  const path = getPathname({ locale, href: "/search" });

  return (
    <Container className="flex flex-col gap-10 pb-24 pt-6 md:gap-14">
      <Breadcrumbs
        label={tDetail("breadcrumbLabel")}
        currentUrl={new URL(path, siteUrl).toString()}
        items={[{ label: tDetail("home"), href: getPathname({ locale, href: "/" }) }, { label: t("breadcrumb") }]}
      />
      <SectionHeading level={1} size="h1" eyebrow={t("eyebrow")} title={t("title")} description={t("hint")} />
      <Suspense fallback={<SearchForm action={path} q="" locale={locale} />}>
        <Results locale={locale} action={path} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function SearchForm({ action, q, locale }: { action: string; q: string; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "SiteSearch" });
  return (
    <form role="search" method="get" action={action} className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
      <label htmlFor="site-search-q" className="sr-only">
        {t("label")}
      </label>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <input
          id="site-search-q"
          type="search"
          name="q"
          defaultValue={q}
          minLength={2}
          maxLength={100}
          required
          autoComplete="off"
          enterKeyHint="search"
          placeholder={t("placeholder")}
          className="h-12 w-full rounded-md border border-input bg-card pl-10 pr-3 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </div>
      <button type="submit" className={buttonVariants({ size: "lg" })}>
        {t("submit")}
      </button>
    </form>
  );
}

function HitList({ id, title, hits, locale }: { id: string; title: string; hits: SiteSearchHit[]; locale: Locale }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-6 border-t border-border pt-10">
      <h3 id={id} className="font-serif text-h3 font-semibold">
        {title}
      </h3>
      <ul className="grid gap-x-10 gap-y-6 md:grid-cols-2">
        {hits.map((hit) => (
          <li key={hit.href} className="flex flex-col gap-1">
            <NextLink href={hit.href} className="font-serif text-h4 font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {hit.title}
            </NextLink>
            {hit.date && <p className="text-small text-muted-foreground">{formatDate(hit.date, locale)}</p>}
            {hit.summary && <p className="line-clamp-2 text-small text-muted-foreground">{hit.summary}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Live results (tours carry current prices and seats), after the request starts. */
async function Results({ locale, action, searchParams }: { locale: Locale; action: string; searchParams: SearchParams }) {
  const raw = first((await searchParams).q);
  await connection();
  const [t, result] = await Promise.all([getTranslations({ locale, namespace: "SiteSearch" }), searchSite(locale, raw)]);
  const form = <SearchForm action={action} q={result?.q ?? (raw ?? "").slice(0, 100)} locale={locale} />;
  if (!result) return form;

  const nothing = result.tours.length === 0 && result.destinations.length === 0 && result.posts.length === 0;
  return (
    <>
      {form}
      <section aria-labelledby="site-search-results" className="flex flex-col gap-12">
        <h2 id="site-search-results" className="font-serif text-h2 font-medium md:text-h2-lg">
          {t("titleQuery", { q: result.q })}
        </h2>
        {nothing ? (
          <div className="flex max-w-xl flex-col gap-4">
            <p className="text-body-lg">{t("none", { q: result.q })}</p>
            <p className="text-body text-muted-foreground">{t("noneText")}</p>
            <div className="flex flex-wrap gap-3">
              <NextLink href={listingHref(locale, {})} className={buttonVariants({})}>
                {t("allTours")}
              </NextLink>
              <NextLink href={getPathname({ locale, href: "/contact" })} className={buttonVariants({ variant: "outline" })}>
                {t("contact")}
              </NextLink>
            </div>
          </div>
        ) : (
          <>
            {result.tours.length > 0 && (
              <section aria-labelledby="site-search-tours" className="flex flex-col gap-8">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 id="site-search-tours" className="font-serif text-h3 font-semibold">
                    {t("tours")} <span className="font-sans text-small font-normal text-muted-foreground">{t("toursCount", { count: result.tourTotal })}</span>
                  </h3>
                  {result.tourTotal > result.tours.length && (
                    <NextLink href={listingHref(locale, { q: result.q })} className={buttonVariants({ variant: "link" })}>
                      {t("seeAllTours", { count: result.tourTotal })}
                    </NextLink>
                  )}
                </div>
                <TourGrid tours={result.tours} locale={locale} headingLevel={3} />
              </section>
            )}
            {result.destinations.length > 0 && <HitList id="site-search-destinations" title={t("destinations")} hits={result.destinations} locale={locale} />}
            {result.posts.length > 0 && <HitList id="site-search-journal" title={t("journal")} hits={result.posts} locale={locale} />}
          </>
        )}
      </section>
    </>
  );
}
