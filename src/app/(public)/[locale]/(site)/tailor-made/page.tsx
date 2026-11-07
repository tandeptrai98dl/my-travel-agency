import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { tailorMadeLabels } from "@/components/inquiry/inquiry-labels";
import { TailorMadeWizard, type WizardDestination } from "@/components/inquiry/tailor-made-wizard";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { fixedLocaleLinks, pageMetadata } from "@/components/seo/page-metadata";
import { SectionHeading } from "@/components/typography/section-heading";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { features } from "@/lib/features";
import { siteUrl } from "@/lib/site-url";
import { getDestinationTree } from "@/modules/catalog/destinations.service";
import { getTravelStyleOptions } from "@/modules/catalog/public/destination-public.service";
import { getPrivacyConsent } from "@/modules/content/public/content-public.service";
import { sendInquiry } from "@/modules/inquiry/tailor-made.actions";
import { inquiryAvailability } from "@/modules/inquiry/tailor-made.service";

type Props = { params: Promise<{ locale: string }> };

const links = () => fixedLocaleLinks({ vi: getPathname({ locale: "vi", href: "/tailor-made" }), en: getPathname({ locale: "en", href: "/tailor-made" }) });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !features.inquiry) return {};
  const t = await getTranslations({ locale, namespace: "TailorMade" });
  return pageMetadata({ locale, title: t("metaTitle"), description: t("metaDescription"), alternates: links() });
}

/**
 * The tailor-made wizard (Phase 5 PR 5W): countries and regions, travel styles and the privacy
 * policy from the cached public reads; the form is disabled until its services are configured
 * and the privacy policy is published in this language.
 */
export default async function TailorMadePage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale) || !features.inquiry) notFound();
  setRequestLocale(locale);
  const [t, tp, tree, styles, privacy, labels] = await Promise.all([
    getTranslations({ locale, namespace: "TailorMade" }),
    getTranslations({ locale, namespace: "Pages" }),
    getDestinationTree(locale),
    getTravelStyleOptions(locale),
    getPrivacyConsent(locale),
    tailorMadeLabels(locale),
  ]);
  const destinations: WizardDestination[] = tree.map((country) => ({
    key: country.key,
    name: country.name,
    children: country.children.map((region) => ({ key: region.key, name: region.name })),
  }));
  const siteKey = privacy ? inquiryAvailability().siteKey : null;

  return (
    <Container className="flex flex-col gap-10 pb-24 pt-6 md:gap-14">
      <Breadcrumbs
        label={tp("breadcrumbLabel")}
        currentUrl={new URL(getPathname({ locale, href: "/tailor-made" }), siteUrl).toString()}
        items={[{ label: tp("home"), href: getPathname({ locale, href: "/" }) }, { label: t("title") }]}
      />
      <SectionHeading level={1} size="h1" eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />
      <div className="max-w-4xl">
        <TailorMadeWizard locale={locale} siteKey={siteKey} privacyHref={privacy?.href ?? null} destinations={destinations} styles={styles} labels={labels} sendInquiry={sendInquiry} />
      </div>
    </Container>
  );
}
