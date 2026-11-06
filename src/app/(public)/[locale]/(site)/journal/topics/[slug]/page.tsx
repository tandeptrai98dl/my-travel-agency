import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { JournalCard } from "@/components/content/journal-card";
import { TopicNav } from "@/components/content/topic-nav";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { LocaleAlternates } from "@/components/layout/locale-alternates";
import { itemListJsonLd } from "@/components/seo/item-list-json-ld";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/components/seo/page-metadata";
import { SectionHeading } from "@/components/typography/section-heading";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";
import { getTopicPage, getTopicSlugs } from "@/modules/content/public/content-public.service";

type Props = { params: Promise<{ locale: string; slug: string }> };

const NONE = "no-published-topic";

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const slugs = isLocale(params.locale) ? await getTopicSlugs(params.locale) : [];
  return (slugs.length ? slugs : [NONE]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || slug === NONE) return {};
  const result = await getTopicPage(locale, slug);
  if (result.kind !== "found") return {};
  const t = await getTranslations({ locale, namespace: "Journal" });
  return pageMetadata({ locale, title: `${result.page.topic.name} · ${t("title")}`, alternates: result.page.alternates });
}

/** One journal topic and its articles. */
export default async function TopicPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || slug === NONE) notFound();
  setRequestLocale(locale);
  const result = await getTopicPage(locale, slug);
  if (result.kind === "redirect") permanentRedirect(getPathname({ locale, href: { pathname: "/journal/topics/[slug]", params: { slug: result.slug } } }));
  if (result.kind === "missing") notFound();
  const { topic, posts, topics, alternates } = result.page;
  const [t, tp] = await Promise.all([getTranslations({ locale, namespace: "Journal" }), getTranslations({ locale, namespace: "Pages" })]);
  return (
    <Container className="flex flex-col gap-10 pb-24 pt-6 md:gap-14">
      <LocaleAlternates links={alternates} />
      <JsonLd
        data={itemListJsonLd(
          t("topicListName", { name: topic.name }),
          posts.map((post) => getPathname({ locale, href: { pathname: "/journal/[slug]", params: { slug: post.slug } } })),
        )}
      />
      <Breadcrumbs
        label={tp("breadcrumbLabel")}
        currentUrl={new URL(alternates[locale].href, siteUrl).toString()}
        items={[
          { label: tp("home"), href: getPathname({ locale, href: "/" }) },
          { label: t("title"), href: getPathname({ locale, href: "/journal" }) },
          { label: topic.name },
        ]}
      />
      <SectionHeading level={1} size="h1" eyebrow={t("topicEyebrow")} title={topic.name} />
      <TopicNav topics={topics} current={topic.slug} label={t("topics")} allLabel={t("allTopics")} />
      <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post, index) => (
          <JournalCard key={post.id} post={post} locale={locale} priority={index < 3} />
        ))}
      </div>
    </Container>
  );
}
