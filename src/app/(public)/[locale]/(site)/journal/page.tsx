import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { JournalCard } from "@/components/content/journal-card";
import { TopicNav } from "@/components/content/topic-nav";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { itemListJsonLd } from "@/components/seo/item-list-json-ld";
import { JsonLd } from "@/components/seo/json-ld";
import { fixedLocaleLinks, pageMetadata } from "@/components/seo/page-metadata";
import { SectionHeading } from "@/components/typography/section-heading";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";
import { getJournalIndex } from "@/modules/content/public/content-public.service";

type Props = { params: Promise<{ locale: string }> };

const links = () => fixedLocaleLinks({ vi: getPathname({ locale: "vi", href: "/journal" }), en: getPathname({ locale: "en", href: "/journal" }) });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Journal" });
  return pageMetadata({ locale, title: t("metaTitle"), description: t("metaDescription"), alternates: links() });
}

/** The journal: newest articles of this language and its topics. */
export default async function JournalPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, tp, journal] = await Promise.all([
    getTranslations({ locale, namespace: "Journal" }),
    getTranslations({ locale, namespace: "Pages" }),
    getJournalIndex(locale),
  ]);
  const path = getPathname({ locale, href: "/journal" });
  return (
    <Container className="flex flex-col gap-10 pb-24 pt-6 md:gap-14">
      <Breadcrumbs
        label={tp("breadcrumbLabel")}
        currentUrl={new URL(path, siteUrl).toString()}
        items={[{ label: tp("home"), href: getPathname({ locale, href: "/" }) }, { label: t("title") }]}
      />
      <SectionHeading level={1} size="h1" eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />
      <TopicNav topics={journal.topics} label={t("topics")} allLabel={t("allTopics")} />
      {journal.posts.length === 0 ? (
        <p className="text-body text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <JsonLd
            data={itemListJsonLd(
              t("listName"),
              journal.posts.map((post) => getPathname({ locale, href: { pathname: "/journal/[slug]", params: { slug: post.slug } } })),
            )}
          />
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {journal.posts.map((post, index) => (
              <JournalCard key={post.id} post={post} locale={locale} priority={index < 3} />
            ))}
          </div>
        </>
      )}
    </Container>
  );
}
