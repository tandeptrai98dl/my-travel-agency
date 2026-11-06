import { Star } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/layout/section";
import { Eyebrow } from "@/components/typography/eyebrow";
import type { Locale } from "@/modules/catalog/public/types";
import type { HomeTestimonial } from "@/modules/content/public/homepage.mapping";

type Props = { locale: Locale; review: HomeTestimonial | null };

/** One approved, featured review on navy with a gold hairline (decision 19); left out when none. */
export async function Testimonial({ locale, review }: Props) {
  if (!review) return null;
  const t = await getTranslations({ locale, namespace: "Home.testimonial" });
  return (
    <Section tone="navy" spacing="editorial" aria-labelledby="home-testimonial">
      <figure className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center">
        <Eyebrow id="home-testimonial">{t("eyebrow")}</Eyebrow>
        <div aria-hidden="true" className="h-px w-16 bg-gold" />
        <p className="flex gap-1 text-gold" role="img" aria-label={t("rating", { rating: review.rating })}>
          {Array.from({ length: 5 }, (_, index) => (
            <Star key={index} className="h-4 w-4" strokeWidth={1.5} fill={index < review.rating ? "currentColor" : "none"} aria-hidden="true" />
          ))}
        </p>
        <blockquote lang={review.locale} className="flex flex-col gap-4">
          {review.title && <p className="font-serif text-h3 font-semibold md:text-h3-lg">{review.title}</p>}
          <p className="text-balance font-serif text-h3 font-medium leading-snug md:text-h2">“{review.content}”</p>
        </blockquote>
        <figcaption className="flex flex-col items-center gap-1 text-small">
          <span className="font-semibold">{review.authorName}</span>
          {(review.authorCountry || review.verified) && (
            <span className="text-muted-foreground">
              {[review.authorCountry, review.verified ? t("verified") : null].filter(Boolean).join(" · ")}
            </span>
          )}
        </figcaption>
      </figure>
    </Section>
  );
}
