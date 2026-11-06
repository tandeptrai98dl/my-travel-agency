import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RichPage } from "@/components/content/rich-page";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { LocaleAlternates } from "@/components/layout/locale-alternates";
import { pageMetadata } from "@/components/seo/page-metadata";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { formatDate } from "@/lib/dates";
import { siteUrl } from "@/lib/site-url";
import { getPolicyPage, getPolicySlugs } from "@/modules/content/public/content-public.service";

type Props = { params: Promise<{ locale: string; slug: string }> };

const NONE = "no-published-policy";

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const slugs = isLocale(params.locale) ? await getPolicySlugs(params.locale) : [];
  return (slugs.length ? slugs : [NONE]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || slug === NONE) return {};
  const result = await getPolicyPage(locale, slug);
  if (result.kind !== "found") return {};
  const page = result.page;
  return pageMetadata({ locale, title: page.seoTitle ?? page.title, description: page.seoDescription, alternates: page.alternates });
}

/** Terms, privacy, cancellation and payment policies by their per-language slugs (decision 15). */
export default async function PolicyPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || slug === NONE) notFound();
  setRequestLocale(locale);
  const result = await getPolicyPage(locale, slug);
  if (result.kind === "redirect") permanentRedirect(getPathname({ locale, href: { pathname: "/policies/[slug]", params: { slug: result.slug } } }));
  if (result.kind === "missing") notFound();
  const page = result.page;
  const t = await getTranslations({ locale, namespace: "Pages" });
  return (
    <>
      <LocaleAlternates links={page.alternates} />
      <RichPage
        locale={locale}
        eyebrow={t("policies")}
        title={page.title}
        meta={page.updatedAt ? t("updated", { date: formatDate(page.updatedAt, locale) }) : null}
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
