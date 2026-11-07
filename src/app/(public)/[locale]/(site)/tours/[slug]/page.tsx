import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { TourDetailView } from "@/components/tour/tour-detail-view";
import { getPathname } from "@/i18n/navigation";
import { isLocale, routing } from "@/i18n/routing";
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
import { getPublicSettings } from "@/modules/settings/settings.service";

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Rendered as a 404 when no tour can be listed at build time (Phase 3 spec decision 4). */
const NO_TOUR = "no-published-tour";

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const slugs = isLocale(params.locale) ? await getPublishedTourSlugs(params.locale) : [];
  return (slugs.length ? slugs : [NO_TOUR]).map((slug) => ({ slug }));
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
  return (
    <TourDetailView
      locale={locale}
      tour={tour}
      related={related}
      reviews={reviews}
      contact={{ phone: settings.contact?.phone ?? null, email: settings.contact?.email ?? null }}
      onlineBooking={onlineBooking}
      loadDepartures={getTourDepartures}
    />
  );
}
