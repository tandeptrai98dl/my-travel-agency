import { Star } from "lucide-react";

import { Link } from "@/i18n/navigation";
import type { PublicReview } from "@/modules/content/public/content-public.mapping";

type Props = { review: PublicReview; labels: { rating: string; verified: string; travelled: string | null; tour: string | null } };

/** One approved review: stars, title, text in its own language, author and the reviewed tour. */
export function ReviewCard({ review, labels }: Props) {
  return (
    <figure className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <p className="flex gap-1 text-gold" role="img" aria-label={labels.rating}>
        {Array.from({ length: 5 }, (_, index) => (
          <Star key={index} className="h-4 w-4" strokeWidth={1.5} fill={index < review.rating ? "currentColor" : "none"} aria-hidden="true" />
        ))}
      </p>
      <blockquote lang={review.locale} className="flex flex-col gap-2">
        {review.title && <p className="font-serif text-h4 font-semibold">{review.title}</p>}
        <p className="text-body">{review.content}</p>
      </blockquote>
      <figcaption className="mt-auto flex flex-col gap-1 text-small">
        <span className="font-semibold">{review.authorName}</span>
        <span className="text-muted-foreground">
          {[review.authorCountry, labels.travelled, review.verified ? labels.verified : null].filter(Boolean).join(" · ")}
        </span>
        {review.tour && labels.tour && (
          <Link
            href={{ pathname: "/tours/[slug]", params: { slug: review.tour.slug } }}
            className="inline-flex min-h-11 items-center self-start underline decoration-gold underline-offset-4 hover:decoration-2"
          >
            {labels.tour}
          </Link>
        )}
      </figcaption>
    </figure>
  );
}
