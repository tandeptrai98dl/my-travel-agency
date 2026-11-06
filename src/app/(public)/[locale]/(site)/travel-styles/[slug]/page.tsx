import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ContactEmptyState } from "@/components/destination/contact-empty-state";
import { PlaceHeader } from "@/components/destination/place-header";
import { TourGridSection } from "@/components/destination/tour-grid-section";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { LocaleAlternates } from "@/components/layout/locale-alternates";
import { itemListJsonLd } from "@/components/seo/item-list-json-ld";
import { JsonLd } from "@/components/seo/json-ld";
import { getPathname, Link } from "@/i18n/navigation";
import { isLocale, routing } from "@/i18n/routing";
import { openGraphImageUrl } from "@/lib/images";
import { siteUrl } from "@/lib/site-url";
import {
  getPublishedTravelStyleSlugs,
  getTravelStylePage,
  type TravelStylePage,
} from "@/modules/catalog/public/destination-public.service";
import type { Locale } from "@/modules/catalog/public/types";
import { getPublicSettings } from "@/modules/settings/settings.service";

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Rendered as a 404 when no travel style can be listed at build time (decision 4). */
const NONE = "no-published-style";

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const slugs = isLocale(params.locale) ? await getPublishedTravelStyleSlugs(params.locale) : [];
  return (slugs.length ? slugs : [NONE]).map((slug) => ({ slug }));
}

async function load(raw: string, slug: string): Promise<{ locale: Locale; page: TravelStylePage }> {
  if (!isLocale(raw) || slug === NONE) notFound();
  const result = await getTravelStylePage(raw, slug);
  if (result.kind === "redirect") {
    permanentRedirect(getPathname({ locale: raw, href: { pathname: "/travel-styles/[slug]", params: { slug: result.slug } } }));
  }
  if (result.kind === "missing") notFound();
  return { locale: raw, page: result.page };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || slug === NONE) return {};
  const result = await getTravelStylePage(locale, slug);
  if (result.kind !== "found") return {};
  const page = result.page;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) if (page.alternates[l].available) languages[l] = page.alternates[l].href;
  if (page.alternates.vi.available) languages["x-default"] = page.alternates.vi.href;
  const title = page.seoTitle ?? page.name;
  const description = page.seoDescription ?? page.description ?? undefined;
  const og = page.image ? openGraphImageUrl(page.image.src) : null;
  return {
    title,
    description,
    alternates: { canonical: page.alternates[locale].href, languages },
    openGraph: {
      type: "website",
      title,
      description,
      url: page.alternates[locale].href,
      locale: locale === "vi" ? "vi_VN" : "en_GB",
      images: og && page.image ? [{ ...og, alt: page.image.alt }] : undefined,
    },
  };
}

/** A travel style (Phase 3 PR J): what it is, its tours and the other styles. */
export default async function TravelStylePageRoute({ params }: Props) {
  const { locale: raw, slug } = await params;
  const { locale, page } = await load(raw, slug);
  setRequestLocale(locale);
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: "TravelStyles" }), getPublicSettings()]);
  const path = page.alternates[locale].href;

  return (
    <article>
      <LocaleAlternates links={page.alternates} />
      {page.tours.length > 0 && (
        <JsonLd
          data={itemListJsonLd(
            t("toursListName", { name: page.name }),
            page.tours.map((tour) => getPathname({ locale, href: { pathname: "/tours/[slug]", params: { slug: tour.slug } } })),
          )}
        />
      )}
      <PlaceHeader
        eyebrow={t("eyebrow")}
        title={page.name}
        summary={page.description}
        image={page.image}
        breadcrumbs={
          <Breadcrumbs
            label={t("breadcrumbLabel")}
            currentUrl={new URL(path, siteUrl).toString()}
            items={[{ label: t("home"), href: getPathname({ locale, href: "/" }) }, { label: page.name }]}
          />
        }
      />
      <Container>
        <TourGridSection
          id="style-tours"
          locale={locale}
          eyebrow={t("toursEyebrow")}
          title={t("toursTitle", { name: page.name })}
          tours={page.tours}
          empty={
            <ContactEmptyState
              text={t("noTours")}
              callLabel={(phone) => t("call", { phone })}
              emailLabel={t("email")}
              contact={settings.contact}
            />
          }
        />
        {page.others.length > 0 && (
          <nav aria-labelledby="style-others" className="flex flex-col gap-6 border-t border-border py-16">
            <h2 id="style-others" className="font-serif text-h3 font-semibold md:text-h3-lg">
              {t("others")}
            </h2>
            <ul className="flex flex-wrap gap-3">
              {page.others.map((style) => (
                <li key={style.key}>
                  <Link
                    href={{ pathname: "/travel-styles/[slug]", params: { slug: style.slug } }}
                    className="inline-flex min-h-11 items-center rounded-md border border-input px-4 text-small font-medium transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {style.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </Container>
    </article>
  );
}
