import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ContactEmptyState } from "@/components/destination/contact-empty-state";
import { DestinationCard } from "@/components/destination/destination-card";
import { PlaceHeader } from "@/components/destination/place-header";
import { TourGridSection } from "@/components/destination/tour-grid-section";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { LocaleAlternates } from "@/components/layout/locale-alternates";
import { itemListJsonLd } from "@/components/seo/item-list-json-ld";
import { JsonLd } from "@/components/seo/json-ld";
import { RichText } from "@/components/typography/rich-text";
import { SectionHeading } from "@/components/typography/section-heading";
import { getPathname } from "@/i18n/navigation";
import { isLocale, routing } from "@/i18n/routing";
import { openGraphImageUrl } from "@/lib/images";
import { siteUrl } from "@/lib/site-url";
import {
  type DestinationPage,
  getDestinationPage,
  getPublishedDestinationSlugs,
} from "@/modules/catalog/public/destination-public.service";
import type { Locale } from "@/modules/catalog/public/types";
import { getPublicSettings } from "@/modules/settings/settings.service";

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Rendered as a 404 when no destination can be listed at build time (decision 4). */
const NONE = "no-published-destination";

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const slugs = isLocale(params.locale) ? await getPublishedDestinationSlugs(params.locale) : [];
  return (slugs.length ? slugs : [NONE]).map((slug) => ({ slug }));
}

async function load(raw: string, slug: string): Promise<{ locale: Locale; page: DestinationPage }> {
  if (!isLocale(raw) || slug === NONE) notFound();
  const result = await getDestinationPage(raw, slug);
  if (result.kind === "redirect") {
    permanentRedirect(getPathname({ locale: raw, href: { pathname: "/destinations/[slug]", params: { slug: result.slug } } }));
  }
  if (result.kind === "missing") notFound();
  return { locale: raw, page: result.page };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || slug === NONE) return {};
  const result = await getDestinationPage(locale, slug);
  if (result.kind !== "found") return {};
  const page = result.page;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) if (page.alternates[l].available) languages[l] = page.alternates[l].href;
  if (page.alternates.vi.available) languages["x-default"] = page.alternates.vi.href;
  const title = page.seoTitle ?? page.name;
  const description = page.seoDescription ?? page.summary ?? undefined;
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

/** A destination (Phase 3 PR J): summary, best time, places below it, its story and its tours. */
export default async function DestinationPageRoute({ params }: Props) {
  const { locale: raw, slug } = await params;
  const { locale, page } = await load(raw, slug);
  setRequestLocale(locale);
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: "Destinations" }), getPublicSettings()]);
  const path = page.alternates[locale].href;
  const destinationPath = (s: string) => getPathname({ locale, href: { pathname: "/destinations/[slug]", params: { slug: s } } });
  const parent = page.ancestors.at(-1);
  const facts = [
    page.bestTime ? { label: t("bestTimeLabel"), value: page.bestTime } : null,
    { label: t("toursLabel"), value: t("tourCount", { count: page.tourCount }) },
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

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
        eyebrow={parent?.name ?? t("title")}
        title={page.name}
        summary={page.summary}
        facts={facts}
        image={page.image}
        breadcrumbs={
          <Breadcrumbs
            label={t("breadcrumbLabel")}
            currentUrl={new URL(path, siteUrl).toString()}
            items={[
              { label: t("home"), href: getPathname({ locale, href: "/" }) },
              { label: t("title"), href: getPathname({ locale, href: "/destinations" }) },
              ...page.ancestors.map((ancestor) => ({ label: ancestor.name, href: destinationPath(ancestor.slug) })),
              { label: page.name },
            ]}
          />
        }
      />
      <Container>
        {page.children.length > 0 && (
          <section aria-labelledby="destination-children" className="flex flex-col gap-10 py-16 md:py-24">
            <SectionHeading
              title={<span id="destination-children">{t(page.type === "country" ? "regions" : "cities", { name: page.name })}</span>}
            />
            <ul className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-8">
              {page.children.map((child) => (
                <li key={child.key}>
                  <DestinationCard destination={child} locale={locale} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {page.content !== null && (
          <section aria-labelledby="destination-about" className="flex flex-col gap-8 border-t border-border py-16 md:py-24">
            <SectionHeading title={<span id="destination-about">{t("aboutTitle", { name: page.name })}</span>} />
            <RichText content={page.content} locale={locale} media={page.contentMedia} />
          </section>
        )}
        <TourGridSection
          id="destination-tours"
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
      </Container>
    </article>
  );
}
