import { getTranslations } from "next-intl/server";

import { Section } from "@/components/layout/section";
import { ResponsiveImage } from "@/components/media/responsive-image";
import { SectionHeading } from "@/components/typography/section-heading";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/dates";
import type { Locale } from "@/modules/catalog/public/types";
import type { HomePost } from "@/modules/content/public/homepage.mapping";

import { ArrowLink } from "./featured-tours";

type Props = { locale: Locale; posts: HomePost[] };

/**
 * The latest journal articles (count from the `homepage` setting): three cards on desktop,
 * thumbnail rows on mobile. Left out when there are none (and until the journal routes exist).
 */
export async function JournalTeaser({ locale, posts }: Props) {
  if (posts.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "Home.journal" });
  return (
    <Section tone="ivory" aria-labelledby="home-journal">
      <div className="flex flex-col gap-10 md:gap-14">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionHeading eyebrow={t("eyebrow")} title={<span id="home-journal">{t("title")}</span>} />
          <ArrowLink href="/journal">{t("viewAll")}</ArrowLink>
        </div>
        <ul className="grid gap-6 md:grid-cols-3 md:gap-8">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={{ pathname: "/journal/[slug]", params: { slug: post.slug } }}
                className="group grid grid-cols-[7rem_minmax(0,1fr)] gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background md:grid-cols-1"
              >
                <div className="relative aspect-square overflow-hidden bg-muted md:aspect-[3/2]">
                  <ResponsiveImage image={post.image} sizes="(min-width: 768px) 33vw, 112px" zoomOnHover />
                </div>
                <div className="flex flex-col gap-2">
                  {post.publishedAt && (
                    <time dateTime={post.publishedAt} className="text-eyebrow font-semibold uppercase text-muted-foreground">
                      {formatDate(post.publishedAt, locale)}
                    </time>
                  )}
                  <h3 className="text-balance font-serif text-h4 font-semibold md:text-h3">{post.title}</h3>
                  {post.excerpt && <p className="line-clamp-2 hidden text-small text-muted-foreground md:block">{post.excerpt}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
