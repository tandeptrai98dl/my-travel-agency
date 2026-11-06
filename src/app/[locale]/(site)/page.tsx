import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DestinationShowcase } from "@/components/marketing/destination-showcase";
import { FeaturedTours } from "@/components/marketing/featured-tours";
import { Hero } from "@/components/marketing/hero";
import { JournalTeaser } from "@/components/marketing/journal-teaser";
import { NewsletterSignup } from "@/components/marketing/newsletter-signup";
import { TailorMadeCta } from "@/components/marketing/tailor-made-cta";
import { Testimonial } from "@/components/marketing/testimonial";
import { TravelStyleCards } from "@/components/marketing/travel-style-cards";
import { TrustBar } from "@/components/marketing/trust-bar";
import { JsonLd } from "@/components/seo/json-ld";
import { travelAgencyJsonLd } from "@/components/seo/travel-agency-json-ld";
import { getPathname } from "@/i18n/navigation";
import { isLocale, routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";
import { getDestinationTree } from "@/modules/catalog/destinations.service";
import { getHomepage } from "@/modules/content/public/homepage";
import { getPublicSettings } from "@/modules/settings/settings.service";

type Props = { params: Promise<{ locale: string }> };

async function brandName(locale: "vi" | "en") {
  const [settings, t] = await Promise.all([getPublicSettings(), getTranslations({ locale, namespace: "Metadata" })]);
  return settings.company?.name ?? t("siteName");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const [t, brand] = await Promise.all([getTranslations({ locale, namespace: "Home" }), brandName(locale)]);
  const title = `${brand} — ${t("metaTitle")}`;
  return {
    title: { absolute: title },
    description: t("metaDescription"),
    alternates: {
      canonical: getPathname({ href: "/", locale }),
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, getPathname({ href: "/", locale: l })])),
        "x-default": getPathname({ href: "/", locale: routing.defaultLocale }),
      },
    },
    // The image comes from ./opengraph-image.tsx (generated, decision 11).
    openGraph: {
      type: "website",
      siteName: brand,
      title,
      description: t("metaDescription"),
      url: getPathname({ href: "/", locale }),
      locale: locale === "vi" ? "vi_VN" : "en_GB",
    },
  };
}

/**
 * Homepage (Phase 3 PR I): sections fixed in code, content from the "featured" flags and the
 * `homepage` setting (ADR-016). Fully cached; each section is left out when it has no data.
 */
export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const [home, settings, destinationTree, brand] = await Promise.all([
    getHomepage(locale),
    getPublicSettings(),
    getDestinationTree(locale),
    brandName(locale),
  ]);

  return (
    <>
      <JsonLd
        data={travelAgencyJsonLd({ settings, locale, name: brand, url: new URL(getPathname({ href: "/", locale }), siteUrl).toString() })}
      />
      <Hero
        locale={locale}
        eyebrow={home.hero.eyebrow}
        title={home.hero.title}
        image={home.hero.image}
        destinations={destinationTree}
        styles={home.travelStyles.map(({ key, name }) => ({ key, name }))}
        months={home.searchMonths}
      />
      <TrustBar locale={locale} settings={settings} />
      <FeaturedTours locale={locale} tours={home.featuredTours} />
      <DestinationShowcase locale={locale} destinations={home.destinations} flushTop={home.featuredTours.length > 0} />
      <TravelStyleCards locale={locale} styles={home.travelStyles} />
      <Testimonial locale={locale} review={home.testimonial} />
      <JournalTeaser locale={locale} posts={home.posts} />
      <TailorMadeCta locale={locale} contact={settings.contact} image={home.destinations[0]?.image ?? null} />
      <NewsletterSignup locale={locale} />
    </>
  );
}
