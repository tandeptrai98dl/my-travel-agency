import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RichPage } from "@/components/content/rich-page";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { LocaleAlternates } from "@/components/layout/locale-alternates";
import { pageMetadata } from "@/components/seo/page-metadata";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";
import { getFixedPage } from "@/modules/content/public/content-public.service";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const page = await getFixedPage(locale, "about");
  if (!page) return {};
  return pageMetadata({ locale, title: page.seoTitle ?? page.title, description: page.seoDescription, alternates: page.alternates });
}

/** About us (pages key `about`, decision 15); 404 until published in this language. */
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, page] = await Promise.all([getTranslations({ locale, namespace: "Pages" }), getFixedPage(locale, "about")]);
  if (!page) notFound();
  return (
    <>
      <LocaleAlternates links={page.alternates} />
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
