import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { JournalCard } from "@/components/content/journal-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { LocaleAlternates } from "@/components/layout/locale-alternates";
import { ResponsiveImage } from "@/components/media/responsive-image";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/components/seo/page-metadata";
import { Eyebrow } from "@/components/typography/eyebrow";
import { RichText } from "@/components/typography/rich-text";
import { SectionHeading } from "@/components/typography/section-heading";
import { getPathname, Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { formatDate } from "@/lib/dates";
import { siteUrl } from "@/lib/site-url";
import { getPostPage, getPostSlugs } from "@/modules/content/public/content-public.service";
import { getPublicSettings } from "@/modules/settings/settings.service";

type Props = { params: Promise<{ locale: string; slug: string }> };

const NONE = "no-published-article";

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const slugs = isLocale(params.locale) ? await getPostSlugs(params.locale) : [];
  return (slugs.length ? slugs : [NONE]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || slug === NONE) return {};
  const result = await getPostPage(locale, slug);
  if (result.kind !== "found") return {};
  const post = result.page;
  return pageMetadata({
    locale,
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
    alternates: post.alternates,
    image: post.image,
    type: "article",
    publishedTime: post.publishedAt,
  });
}

/** One article: editorial layout with its cover, rich text, `Article` JSON-LD and related articles. */
export default async function ArticlePage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || slug === NONE) notFound();
  setRequestLocale(locale);
  const result = await getPostPage(locale, slug);
  if (result.kind === "redirect") permanentRedirect(getPathname({ locale, href: { pathname: "/journal/[slug]", params: { slug: result.slug } } }));
  if (result.kind === "missing") notFound();
  const post = result.page;
  const [t, tp, settings, tm] = await Promise.all([
    getTranslations({ locale, namespace: "Journal" }),
    getTranslations({ locale, namespace: "Pages" }),
    getPublicSettings(),
    getTranslations({ locale, namespace: "Metadata" }),
  ]);
  const url = new URL(post.alternates[locale].href, siteUrl).toString();
  const brand = settings.company?.name ?? tm("siteName");

  return (
    <article>
      <LocaleAlternates links={post.alternates} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.title,
          ...(post.excerpt ? { description: post.excerpt } : {}),
          ...(post.image ? { image: [post.image.src] } : {}),
          ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
          ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
          inLanguage: locale,
          mainEntityOfPage: url,
          publisher: { "@type": "Organization", name: brand },
          author: { "@type": "Organization", name: brand },
        }}
      />
      <Container className="flex flex-col gap-8 pb-10 pt-6 md:pb-14">
        <Breadcrumbs
          label={tp("breadcrumbLabel")}
          currentUrl={url}
          items={[
            { label: tp("home"), href: getPathname({ locale, href: "/" }) },
            { label: t("title"), href: getPathname({ locale, href: "/journal" }) },
            { label: post.title },
          ]}
        />
        <header className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 text-center">
          {post.topic && (
            <Eyebrow>
              <Link href={{ pathname: "/journal/topics/[slug]", params: { slug: post.topic.slug } }} className="hover:underline">
                {post.topic.name}
              </Link>
            </Eyebrow>
          )}
          <h1 className="text-balance font-serif text-h1 font-medium md:text-h1-lg">{post.title}</h1>
          {post.excerpt && <p className="text-body-lg text-muted-foreground md:text-body-lg-lg">{post.excerpt}</p>}
          {post.publishedAt && (
            <p className="text-small text-muted-foreground">
              <time dateTime={post.publishedAt}>{t("published", { date: formatDate(post.publishedAt, locale) })}</time>
            </p>
          )}
        </header>
      </Container>
      {post.image && (
        <Container>
          <div className="relative aspect-[3/2] overflow-hidden bg-muted md:aspect-[21/9]">
            <ResponsiveImage image={post.image} sizes="(min-width: 1280px) 1216px, 100vw" priority />
          </div>
        </Container>
      )}
      <Container className="py-12 md:py-16">
        <div className="mx-auto max-w-[680px]">
          <RichText content={post.content} locale={locale} media={post.contentMedia} />
        </div>
      </Container>
      {post.related.length > 0 && (
        <Container>
          <section aria-labelledby="article-related" className="flex flex-col gap-10 border-t border-border py-16 md:py-24">
            <SectionHeading title={<span id="article-related">{t("related")}</span>} />
            <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {post.related.map((card) => (
                <JournalCard key={card.id} post={card} locale={locale} headingLevel={3} />
              ))}
            </div>
          </section>
        </Container>
      )}
    </article>
  );
}
