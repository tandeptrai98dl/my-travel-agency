import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DestinationCard } from "@/components/destination/destination-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { itemListJsonLd } from "@/components/seo/item-list-json-ld";
import { JsonLd } from "@/components/seo/json-ld";
import { SectionHeading } from "@/components/typography/section-heading";
import { getPathname, Link } from "@/i18n/navigation";
import { isLocale, routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";
import { getDestinationIndex } from "@/modules/catalog/public/destination-public.service";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Destinations" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      canonical: getPathname({ locale, href: "/destinations" }),
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, getPathname({ locale: l, href: "/destinations" })])),
        "x-default": getPathname({ locale: routing.defaultLocale, href: "/destinations" }),
      },
    },
    openGraph: { type: "website", title: t("metaTitle"), description: t("metaDescription"), url: getPathname({ locale, href: "/destinations" }) },
  };
}

/** Destinations (Phase 3 PR J): each country with its regions and places, and tour counts. */
export default async function DestinationsPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, countries] = await Promise.all([getTranslations({ locale, namespace: "Destinations" }), getDestinationIndex(locale)]);
  const path = getPathname({ locale, href: "/destinations" });
  const destinationPath = (slug: string) => getPathname({ locale, href: { pathname: "/destinations/[slug]", params: { slug } } });

  return (
    <Container className="flex flex-col gap-12 pb-24 pt-6 md:gap-16">
      <Breadcrumbs
        label={t("breadcrumbLabel")}
        currentUrl={new URL(path, siteUrl).toString()}
        items={[{ label: t("home"), href: getPathname({ locale, href: "/" }) }, { label: t("title") }]}
      />
      <SectionHeading level={1} size="h1" eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />
      {countries.length === 0 ? (
        <p className="text-body text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <JsonLd data={itemListJsonLd(t("listName"), countries.map((country) => destinationPath(country.slug)))} />
          {countries.map((country, index) => (
            <section key={country.key} aria-label={country.name} className="grid gap-8 border-t border-border pt-12 md:grid-cols-12 md:gap-12">
              <div className="md:col-span-7">
                <DestinationCard destination={country} locale={locale} headingLevel={2} shape="wide" priority={index === 0} />
              </div>
              <div className="flex flex-col gap-6 md:col-span-5">
                {country.summary && <p className="text-body-lg text-muted-foreground">{country.summary}</p>}
                {country.children.length > 0 && (
                  <nav aria-label={t("regions", { name: country.name })}>
                    <ul className="flex flex-col gap-5">
                      {country.children.map((region) => (
                        <li key={region.key} className="flex flex-col gap-2">
                          <Link
                            href={{ pathname: "/destinations/[slug]", params: { slug: region.slug } }}
                            className="flex items-baseline justify-between gap-4 border-b border-border pb-2 font-serif text-h4 font-semibold hover:underline hover:decoration-gold md:text-h3"
                          >
                            <span>{region.name}</span>
                            <span className="shrink-0 font-sans text-small font-normal text-muted-foreground">{t("tourCount", { count: region.tourCount })}</span>
                          </Link>
                          {region.children.length > 0 && (
                            <ul className="flex flex-wrap gap-x-4 gap-y-1">
                              {region.children.map((city) => (
                                <li key={city.key}>
                                  <Link
                                    href={{ pathname: "/destinations/[slug]", params: { slug: city.slug } }}
                                    className="inline-flex min-h-11 items-center text-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline hover:decoration-gold"
                                  >
                                    {city.name}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}
              </div>
            </section>
          ))}
        </>
      )}
    </Container>
  );
}
