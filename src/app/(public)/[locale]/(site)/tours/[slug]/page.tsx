import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { tourInquiryLabels } from "@/components/inquiry/inquiry-labels";
import { TourDetailView } from "@/components/tour/tour-detail-view";
import { getPathname } from "@/i18n/navigation";
import { slugParams } from "@/i18n/static-params";
import { isLocale, routing } from "@/i18n/routing";
import { features } from "@/lib/features";
import { openGraphImageUrl } from "@/lib/images";
import {
  getPublishedTourSlugs,
  getRelatedTours,
  getTourDepartures,
  getTourPage,
  getTourReviews,
  type TourPage,
} from "@/modules/catalog/public/tour-public.service";
import type { Locale } from "@/modules/catalog/public/types";
import { onlineBookingAvailable } from "@/modules/catalog/public/online-booking.service";
import { getPrivacyConsent } from "@/modules/content/public/content-public.service";
import { inquiryAvailability } from "@/modules/inquiry/tailor-made.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Rendered as a 404 when no tour can be listed at build time (Phase 3 spec decision 4). */
const NO_TOUR = "no-published-tour";

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  return slugParams(params.locale, getPublishedTourSlugs, NO_TOUR);
}

async function load(locale: string, slug: string): Promise<{ locale: Locale; tour: TourPage }> {
  if (!isLocale(locale) || slug === NO_TOUR) notFound();
  const result = await getTourPage(locale, slug);
  if (result.kind === "redirect") {
    permanentRedirect(getPathname({ locale, href: { pathname: "/tours/[slug]", params: { slug: result.slug } } }));
  }
  if (result.kind === "missing") notFound();
  return { locale, tour: result.tour };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw) || slug === NO_TOUR) return {};
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
  const [related, reviews, settings, onlineBooking] = await Promise.all([
    getRelatedTours(locale, tour),
    getTourReviews(tour.id),
    getPublicSettings(),
    onlineBookingAvailable(),
  ]);
  // Private tours take an inquiry on the page (Phase 5 PR 5W).
  const inquiry =
    tour.type === "private" && features.inquiry
      ? await (async () => {
          const [privacy, labels, ti] = await Promise.all([getPrivacyConsent(locale), tourInquiryLabels(locale), getTranslations({ locale, namespace: "TourInquiry" })]);
          return { siteKey: privacy ? inquiryAvailability().siteKey : null, privacyHref: privacy?.href ?? null, labels, title: ti("title"), intro: ti("intro") };
        })()
      : null;
  return (
    <TourDetailView
      locale={locale}
      tour={tour}
      related={related}
      reviews={reviews}
      contact={{ phone: settings.contact?.phone ?? null, email: settings.contact?.email ?? null }}
      onlineBooking={onlineBooking}
      loadDepartures={getTourDepartures}
      inquiry={inquiry}
    />
  );
}
