import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { TourCard } from "@/components/tour/tour-card";
import { SectionHeading } from "@/components/typography/section-heading";
import { getPathname } from "@/i18n/navigation";
import { isLocale, routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";
import { getAllTourCards } from "@/modules/catalog/public/tour-public.service";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "TourList" });
  return {
    title: t("title"),
    description: t("intro"),
    alternates: {
      canonical: getPathname({ locale, href: "/tours" }),
      languages: Object.fromEntries(routing.locales.map((l) => [l, getPathname({ locale: l, href: "/tours" })])),
    },
  };
}

/**
 * Every published tour, in the recommended order. An interim page so tour links never 404; the
 * full listing with search, filters and paging replaces it in Phase 3 PR L (tour-listing.md).
 */
export default async function ToursPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, tDetail, tours] = await Promise.all([
    getTranslations({ locale, namespace: "TourList" }),
    getTranslations({ locale, namespace: "TourDetail" }),
    getAllTourCards(locale),
  ]);
  const path = getPathname({ locale, href: "/tours" });

  return (
    <Container className="flex flex-col gap-10 pb-24 pt-6 md:gap-14">
      <Breadcrumbs
        label={tDetail("breadcrumbLabel")}
        currentUrl={new URL(path, siteUrl).toString()}
        items={[{ label: tDetail("home"), href: getPathname({ locale, href: "/" }) }, { label: tDetail("tours") }]}
      />
      <SectionHeading level={1} size="h1" eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />
      {tours.length === 0 ? (
        <p className="text-body text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {tours.map((tour, index) => (
            <TourCard key={tour.id} tour={tour} locale={locale} headingLevel={2} priority={index < 3} />
          ))}
        </div>
      )}
    </Container>
  );
}
