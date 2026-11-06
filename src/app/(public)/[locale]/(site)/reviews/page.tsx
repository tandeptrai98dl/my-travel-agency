import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ReviewCard } from "@/components/content/review-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/layout/container";
import { fixedLocaleLinks, pageMetadata } from "@/components/seo/page-metadata";
import { SectionHeading } from "@/components/typography/section-heading";
import { getPathname } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { formatMonth } from "@/lib/dates";
import { siteUrl } from "@/lib/site-url";
import { getReviewsPage } from "@/modules/content/public/content-public.service";

type Props = { params: Promise<{ locale: string }> };

const links = () => fixedLocaleLinks({ vi: getPathname({ locale: "vi", href: "/reviews" }), en: getPathname({ locale: "en", href: "/reviews" }) });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Reviews" });
  return pageMetadata({ locale, title: t("metaTitle"), description: t("metaDescription"), alternates: links() });
}

/**
 * Approved reviews, newest first, each in its own language, with the count and average. No
 * `AggregateRating` structured data until reviews are verified post-trip reviews (P1).
 */
export default async function ReviewsPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, tp, data] = await Promise.all([
    getTranslations({ locale, namespace: "Reviews" }),
    getTranslations({ locale, namespace: "Pages" }),
    getReviewsPage(locale),
  ]);
  const path = getPathname({ locale, href: "/reviews" });
  return (
    <Container className="flex flex-col gap-10 pb-24 pt-6 md:gap-14">
      <Breadcrumbs
        label={tp("breadcrumbLabel")}
        currentUrl={new URL(path, siteUrl).toString()}
        items={[{ label: tp("home"), href: getPathname({ locale, href: "/" }) }, { label: t("title") }]}
      />
      <SectionHeading
        level={1}
        size="h1"
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={data.average !== null ? t("summary", { average: data.average.toLocaleString(locale === "vi" ? "vi-VN" : "en-GB"), count: data.count }) : undefined}
      />
      {data.reviews.length === 0 ? (
        <p className="text-body text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.reviews.map((review) => (
            <li key={review.id}>
              <ReviewCard
                review={review}
                labels={{
                  rating: t("rating", { rating: review.rating }),
                  verified: t("verified"),
                  travelled: review.travelDate ? t("travelled", { date: formatMonth(review.travelDate.slice(0, 7), locale) }) : null,
                  tour: review.tour ? t("tour", { title: review.tour.title }) : null,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
