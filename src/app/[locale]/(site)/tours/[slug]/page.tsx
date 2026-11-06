import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cache, Suspense } from "react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { LocaleAlternates } from "@/components/layout/locale-alternates";
import { JsonLd } from "@/components/seo/json-ld";
import { BookingBox } from "@/components/tour/booking-box";
import { DepartureTable, type DepartureLabels } from "@/components/tour/departure-table";
import { DeparturesErrorBoundary } from "@/components/tour/departures-error-boundary";
import { FaqList } from "@/components/tour/faq-list";
import { InclusionsList } from "@/components/tour/inclusions-list";
import { ItineraryTimeline } from "@/components/tour/itinerary-timeline";
import { PolicySummary } from "@/components/tour/policy-summary";
import { PriceTiers } from "@/components/tour/price-tiers";
import { RelatedTours } from "@/components/tour/related-tours";
import { ReviewSummary } from "@/components/tour/review-summary";
import { TourFactsBar } from "@/components/tour/tour-facts-bar";
import { TourGallery } from "@/components/tour/tour-gallery";
import { TourHeader } from "@/components/tour/tour-header";
import { TourHighlights } from "@/components/tour/tour-highlights";
import { Heading } from "@/components/typography/heading";
import { Skeleton } from "@/components/ui/skeleton";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { formatDate } from "@/lib/dates";
import { openGraphImageUrl } from "@/lib/images";
import { formatVnd } from "@/lib/money";
import { siteUrl } from "@/lib/site-url";
import {
  getPublishedTourSlugs,
  getRelatedTours,
  getTourDepartures,
  getTourPage,
  getTourReviews,
  type TourPage,
} from "@/modules/catalog/public/tour-public.service";
import type { Locale } from "@/modules/catalog/public/types";
import { getPublicSettings } from "@/modules/settings/settings.service";

import { tourJsonLd } from "./tour-json-ld";

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Rendered as a 404 when no tour can be listed at build time (Phase 3 spec decision 4). */
const NO_TOUR = "no-published-tour";

// One departures read per request for the table and the booking box (never cached).
const departuresOnce = cache(getTourDepartures);

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const slugs = hasLocale(routing.locales, params.locale) ? await getPublishedTourSlugs(params.locale) : [];
  return (slugs.length ? slugs : [NO_TOUR]).map((slug) => ({ slug }));
}

async function load(locale: string, slug: string): Promise<{ locale: Locale; tour: TourPage }> {
  if (!hasLocale(routing.locales, locale) || slug === NO_TOUR) notFound();
  const result = await getTourPage(locale, slug);
  if (result.kind === "redirect") {
    permanentRedirect(getPathname({ locale, href: { pathname: "/tours/[slug]", params: { slug: result.slug } } }));
  }
  if (result.kind === "missing") notFound();
  return { locale, tour: result.tour };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!hasLocale(routing.locales, raw) || slug === NO_TOUR) return {};
  const result = await getTourPage(raw, slug);
  if (result.kind !== "found") return {};
  const tour = result.tour;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) if (tour.alternates[l].available) languages[l] = tour.alternates[l].href;
  if (tour.alternates.vi.available) languages["x-default"] = tour.alternates.vi.href;
  const title = tour.seoTitle ?? tour.title;
  const description = tour.seoDescription ?? tour.summary;
  const og = tour.ogImage ? openGraphImageUrl(tour.ogImage.src) : null;
  return {
    title,
    description,
    alternates: { canonical: tour.alternates[raw].href, languages },
    openGraph: {
      type: "website",
      title,
      description,
      url: tour.alternates[raw].href,
      locale: raw === "vi" ? "vi_VN" : "en_GB",
      images: og && tour.ogImage ? [{ ...og, alt: tour.ogImage.alt }] : undefined,
    },
  };
}

export default async function TourDetailPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const { locale, tour } = await load(raw, slug);
  setRequestLocale(locale);

  const [t, tCard, related, reviews] = await Promise.all([
    getTranslations({ locale, namespace: "TourDetail" }),
    getTranslations({ locale, namespace: "TourCard" }),
    getRelatedTours(locale, tour),
    getTourReviews(tour.id),
  ]);
  const isPrivate = tour.type === "private";
  const currentUrl = new URL(tour.alternates[locale].href, siteUrl).toString();

  const facts = [
    { label: t("facts.duration"), value: tCard("duration", { days: tour.durationDays, nights: tour.durationNights }) },
    isPrivate
      ? { label: t("facts.groupSize"), value: t("facts.privateMin", { count: tour.minPax }) }
      : tour.maxPax
        ? { label: t("facts.groupSize"), value: t("facts.groupMax", { count: tour.maxPax }) }
        : null,
    { label: t("facts.type"), value: isPrivate ? t("facts.typePrivate") : t("facts.typeGroup") },
    tour.styles.length ? { label: t("facts.style"), value: tour.styles.map((style) => style.name).join(", ") } : null,
    { label: t("facts.code"), value: tour.code },
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

  const meals = (list: readonly string[]) => list.map((meal) => t(`itinerary.${meal}` as "itinerary.breakfast")).join(", ");
  const days = tour.itinerary.map((day) => ({
    day: day.day,
    title: day.title,
    description: day.description,
    image: day.image,
    details: [
      day.meals.length ? t("itinerary.meals", { meals: meals(day.meals) }) : null,
      day.accommodation ? t("itinerary.overnight", { place: day.accommodation }) : null,
    ].filter((line): line is string => line !== null),
  }));

  const rules = [...(tour.policy?.rules ?? [])].sort((a, b) => b.minDaysBefore - a.minDaysBefore);
  const policyLines = tour.policy?.summary
    ? [tour.policy.summary]
    : rules.map((rule, index) =>
        rule.minDaysBefore > 0
          ? t("policy.rule", { days: rule.minDaysBefore, percent: rule.refundPercent })
          : t("policy.ruleLast", { days: rules[index - 1]?.minDaysBefore ?? 1, percent: rule.refundPercent }),
      );

  const sectionClass = "flex flex-col gap-6 border-t border-border py-12 md:py-16";

  return (
    <article>
      <LocaleAlternates links={tour.alternates} />
      <Container className="pb-8 pt-6">
        <Breadcrumbs
          label={t("breadcrumbLabel")}
          currentUrl={currentUrl}
          items={[
            { label: t("home"), href: getPathname({ locale, href: "/" }) },
            { label: t("tours"), href: getPathname({ locale, href: "/tours" }) },
            { label: tour.title },
          ]}
        />
      </Container>
      <Container>
        <TourGallery
          images={[tour.hero, ...tour.gallery].filter((image) => image !== null)}
          title={tour.title}
          labels={{
            viewAll: t("gallery.viewAll", { count: "{count}" }),
            dialogTitle: t("gallery.title"),
            close: t("gallery.close"),
            previous: t("gallery.previous"),
            next: t("gallery.next"),
            counter: t("gallery.counter", { index: "{index}", count: "{count}" }),
          }}
        />
        <div className="flex flex-col gap-8 pb-8 pt-10 md:pt-12">
          <TourHeader
            eyebrow={tour.destinations.slice(0, 3).map((destination) => destination.name).join(" · ") || null}
            title={tour.title}
            subtitle={tour.subtitle}
          />
          <TourFactsBar facts={facts} label={t("facts.label")} />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-16 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <aside aria-label={t("booking.label")} className="min-w-0 pb-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start lg:pt-12">
            <DeparturesErrorBoundary message={t("booking.unavailable")} retryLabel={t("departures.retry")}>
              <Suspense fallback={<Skeleton className="h-80 w-full" />}>
                <LiveBookingBox locale={locale} tour={tour} />
              </Suspense>
            </DeparturesErrorBoundary>
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <section className="flex flex-col gap-8 py-10 md:py-12">
              <p className="max-w-prose text-balance font-serif text-h3 font-medium md:text-h3-lg">{tour.summary}</p>
              <TourHighlights items={tour.highlights} label={t("highlights")} />
            </section>

            {days.length > 0 && (
              <section aria-labelledby="itinerary" className={sectionClass}>
                <Heading level={2} id="itinerary">{t("itinerary.title")}</Heading>
                <ItineraryTimeline days={days} dayLabel={t("itinerary.day")} />
              </section>
            )}

            {(tour.inclusions.length > 0 || tour.exclusions.length > 0) && (
              <section aria-labelledby="inclusions" className={sectionClass}>
                <Heading level={2} id="inclusions">{t("inclusions")}</Heading>
                <InclusionsList included={tour.inclusions} excluded={tour.exclusions} excludedTitle={t("exclusions")} />
              </section>
            )}

            {tour.practicalInfo && (
              <section aria-labelledby="practical" className={sectionClass}>
                <Heading level={2} id="practical">{t("practicalInfo")}</Heading>
                <p className="max-w-prose whitespace-pre-line text-body">{tour.practicalInfo}</p>
              </section>
            )}

            {isPrivate ? (
              tour.priceTiers.length > 0 && (
                <section aria-labelledby="tiers" className={sectionClass}>
                  <Heading level={2} id="tiers">{t("tiers.title")}</Heading>
                  <PriceTiers
                    tiers={tour.priceTiers}
                    locale={locale}
                    labels={{
                      range: (min, max) => t("tiers.range", { min, max }),
                      perAdult: t("tiers.perAdult"),
                      note: t("tiers.note"),
                    }}
                  />
                </section>
              )
            ) : (
              <section id="departures" aria-labelledby="departures-title" className={sectionClass}>
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <Heading level={2} id="departures-title">{t("departures.title")}</Heading>
                  <p className="text-small text-muted-foreground">{t("departures.live")}</p>
                </div>
                <DeparturesErrorBoundary message={t("departures.error")} retryLabel={t("departures.retry")}>
                  <Suspense fallback={<DeparturesSkeleton label={t("departures.loading")} />}>
                    <LiveDepartures locale={locale} tour={tour} />
                  </Suspense>
                </DeparturesErrorBoundary>
              </section>
            )}

            <section aria-labelledby="policy" className={sectionClass}>
              <Heading level={2} id="policy">{t("policy.title")}</Heading>
              <PolicySummary
                payment={{
                  title: t("policy.payment"),
                  text: t("policy.paymentText", { deposit: tour.depositPercent, days: tour.balanceDueDays }),
                }}
                cancellation={policyLines.length ? { title: t("policy.cancellation"), lines: policyLines } : null}
              />
            </section>

            {reviews.count > 0 && reviews.average !== null && (
              <section aria-labelledby="reviews" className={sectionClass}>
                <Heading level={2} id="reviews">{t("reviews.title")}</Heading>
                <ReviewSummary
                  summary={t("reviews.summary", {
                    average: reviews.average.toLocaleString(locale === "vi" ? "vi-VN" : "en-GB"),
                    count: reviews.count,
                  })}
                  reviews={reviews.latest.map((review) => ({
                    ...review,
                    when: review.travelDate ? formatDate(review.travelDate, locale) : null,
                  }))}
                  labels={{ rating: (rating) => t("reviews.rating", { rating }), verified: t("reviews.verified") }}
                />
              </section>
            )}

            {tour.faqs.length > 0 && (
              <section aria-labelledby="faq" className={sectionClass}>
                <Heading level={2} id="faq">{t("faq")}</Heading>
                <FaqList items={tour.faqs} />
              </section>
            )}
          </div>
        </div>

        <RelatedTours tours={related} locale={locale} eyebrow={t("related.eyebrow")} title={t("related.title")} />
      </Container>
      {isPrivate && <JsonLd data={tourJsonLd(tour, currentUrl, [])} />}
    </article>
  );
}

function DeparturesSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

async function LiveDepartures({ locale, tour }: { locale: Locale; tour: TourPage }) {
  await connection();
  const [rows, t] = await Promise.all([departuresOnce(tour.id), getTranslations({ locale, namespace: "TourDetail.departures" })]);
  const currentUrl = new URL(tour.alternates[locale].href, siteUrl).toString();
  if (rows.length === 0) {
    return (
      <>
        <p className="max-w-prose text-body text-muted-foreground">{t("empty")}</p>
        <JsonLd data={tourJsonLd(tour, currentUrl, [])} />
      </>
    );
  }
  const labels: DepartureLabels = {
    dates: t("dates"),
    status: t("status"),
    seats: t("seats"),
    price: t("price"),
    none: t("none"),
    seatsLeft: (count) => t("seatsLeft", { count }),
    states: {
      open: t("open"),
      few: t("few"),
      guaranteed: t("guaranteed"),
      closed: t("closed"),
      soldOut: t("soldOut"),
      cutoff: t("cutoff"),
    },
  };
  const next = rows.find((row) => row.bookable);
  const notes = [
    next?.priceChild != null ? t("child", { age: tour.childAgeMax, price: formatVnd(next.priceChild, locale) }) : null,
    next?.priceInfant != null ? t("infant", { age: tour.infantAgeMax + 1, price: formatVnd(next.priceInfant, locale) }) : null,
    next?.singleSupplement != null ? t("single", { price: formatVnd(next.singleSupplement, locale) }) : null,
    tour.minPaxToOperate ? t("minPax", { count: tour.minPaxToOperate }) : null,
  ].filter((line): line is string => line !== null);

  return (
    <>
      <DepartureTable rows={rows} locale={locale} labels={labels} />
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-small text-muted-foreground">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <JsonLd data={tourJsonLd(tour, currentUrl, rows)} />
    </>
  );
}

async function LiveBookingBox({ locale, tour }: { locale: Locale; tour: TourPage }) {
  await connection();
  const [rows, settings] = await Promise.all([
    tour.type === "group" ? departuresOnce(tour.id) : Promise.resolve([]),
    getPublicSettings(),
  ]);
  return (
    <BookingBox
      locale={locale}
      tour={{
        code: tour.code,
        type: tour.type,
        fromPrice: tour.fromPrice,
        depositPercent: tour.depositPercent,
        minTierPrice: tour.priceTiers.length ? Math.min(...tour.priceTiers.map((tier) => tier.pricePerAdult)) : null,
      }}
      bookable={rows.filter((row) => row.bookable)}
      contact={{ phone: settings.contact?.phone ?? null, email: settings.contact?.email ?? null }}
    />
  );
}
