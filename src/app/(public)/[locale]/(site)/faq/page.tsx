import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RichPage } from "@/components/content/rich-page";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { LocaleAlternates } from "@/components/layout/locale-alternates";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/components/seo/page-metadata";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";
import { faqFromRichText } from "@/modules/content/public/content-public.mapping";
import { getFixedPage } from "@/modules/content/public/content-public.service";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const page = await getFixedPage(locale, "faq");
  if (!page) return {};
  return pageMetadata({ locale, title: page.seoTitle ?? page.title, description: page.seoDescription, alternates: page.alternates });
}

/**
 * FAQ (pages key `faq`): the rich text as written, plus `FAQPage` structured data built from it
 * (each heading a question, the text below it the answer; decision 10).
 */
export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, page] = await Promise.all([getTranslations({ locale, namespace: "Pages" }), getFixedPage(locale, "faq")]);
  if (!page) notFound();
  const faqs = faqFromRichText(page.content);
  return (
    <>
      <LocaleAlternates links={page.alternates} />
      {faqs.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: { "@type": "Answer", text: faq.answer },
            })),
          }}
        />
      )}
      <RichPage
        locale={locale}
        title={page.title}
        content={page.content}
        media={page.contentMedia}
        breadcrumbs={
          <Breadcrumbs
            label={t("breadcrumbLabel")}
            currentUrl={new URL(page.alternates[locale].href, siteUrl).toString()}
            items={[{ label: t("home"), href: getPathname({ locale, href: "/" }) }, { label: page.title }]}
          />
        }
      />
    </>
  );
}
