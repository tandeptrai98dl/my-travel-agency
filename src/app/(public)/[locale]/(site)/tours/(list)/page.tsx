import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { itemListJsonLd } from "@/components/seo/item-list-json-ld";
import { JsonLd } from "@/components/seo/json-ld";
import { TourGridSkeleton } from "@/components/tour/listing/tour-grid-skeleton";
import { AnalyticsEvent } from "@/components/analytics/analytics-event";
import { viewItemList } from "@/components/analytics/events";
import { TourListingCta, TourListingNone, TourListingView } from "@/components/tour/listing/tour-listing-view";
import { SectionHeading } from "@/components/typography/section-heading";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { upcomingMonths } from "@/lib/dates";
import { siteUrl } from "@/lib/site-url";
import { getTourFilterOptions, searchTourListing } from "@/modules/catalog/public/tour-listing.service";
import { getFeaturedTourCards } from "@/modules/catalog/public/tour-public.service";
import type { Locale } from "@/modules/catalog/public/types";
import { listingHref } from "@/modules/catalog/tour-listing-href";
import { isFilteredSearch, parseTourSearchParams } from "@/modules/catalog/tour-search-params";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

/**
 * Title, description, canonical and hreflang (docs/specs/tour-listing.md §2.7): unfiltered pages,
 * `?page=n` included, are canonical to themselves with hreflang; any search, filter or other sort
 * is `noindex, follow` with the canonical `/tours`.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const [t, raw] = await Promise.all([getTranslations({ locale, namespace: "TourListing" }), searchParams]);
  const criteria = parseTourSearchParams(raw);
  const title = criteria.page > 1 ? t("metaTitlePage", { page: criteria.page }) : t("metaTitle");
  const description = t("metaDescription");
  const base = getPathname({ locale, href: "/tours" });
  if (isFilteredSearch(criteria)) {
    return { title, description, robots: { index: false, follow: true }, alternates: { canonical: base } };
  }
  const own = (l: Locale) => listingHref(l, { page: criteria.page });
  return {
    title,
    description,
    alternates: { canonical: own(locale), languages: { vi: own("vi"), en: own("en"), "x-default": own("vi") } },
    openGraph: { type: "website", title, description, url: own(locale) },
  };
}

/** Tour listing (Phase 3 PR L, docs/specs/tour-listing.md): the URL holds the whole search. */
export default async function ToursPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "TourListing" });
  const tDetail = await getTranslations({ locale, namespace: "TourDetail" });
  const path = getPathname({ locale, href: "/tours" });

  return (
    <>
      <Container className="flex flex-col gap-8 pb-24 pt-6 md:gap-12">
        <Breadcrumbs
          label={tDetail("breadcrumbLabel")}
          currentUrl={new URL(path, siteUrl).toString()}
          items={[{ label: tDetail("home"), href: getPathname({ locale, href: "/" }) }, { label: t("breadcrumb") }]}
        />
        <SectionHeading level={1} size="h1" eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />
        <Suspense fallback={<TourGridSkeleton label={t("updating")} />}>
          <Listing locale={locale} searchParams={searchParams} listName={t("title")} />
        </Suspense>
      </Container>
      <TourListingCta locale={locale} />
    </>
  );
}

/** Live results (not cached: prices and seats change with bookings); filter options are cached. */
async function Listing({ locale, searchParams, listName }: { locale: Locale; searchParams: SearchParams; listName: string }) {
  const raw = await searchParams;
  // Request time from here on (decision 3): results are live and the month list starts today.
  await connection();
  const months = upcomingMonths(12);
  const options = await getTourFilterOptions(locale);
  const result = await searchTourListing(locale, parseTourSearchParams(raw, { months }), options);
  // A page past the end goes to the last page (§1.6).
  if (result.kind === "outOfRange") redirect(listingHref(locale, { ...result.criteria, page: result.lastPage }));

  const filtered = isFilteredSearch(result.criteria);
  if (result.total === 0 && !filtered) return <TourListingNone locale={locale} />;
  const suggestions = result.total === 0 ? await getFeaturedTourCards(locale, 3) : [];
  const tourPath = (slug: string) => getPathname({ locale, href: { pathname: "/tours/[slug]", params: { slug } } });

  return (
    <>
      {result.items.length > 0 && <JsonLd data={itemListJsonLd(listName, result.items.map((tour) => tourPath(tour.slug)))} />}
      {result.items.length > 0 && (
        // GA4 (ADR-039), once per page of results; sent only after consent.
        <AnalyticsEvent
          key={result.items.map((tour) => tour.id).join()}
          event={viewItemList("tours", result.items.map((tour) => ({ code: tour.code, title: tour.title, price: tour.displayPrice })))}
        />
      )}
      <TourListingView
        locale={locale}
        criteria={result.criteria}
        options={options}
        months={months}
        items={result.items}
        total={result.total}
        totalPages={result.totalPages}
        suggestions={suggestions}
      />
    </>
  );
}
