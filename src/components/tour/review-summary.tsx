import { Star } from "lucide-react";

type Review = {
  id: string;
  authorName: string;
  authorCountry: string | null;
  rating: number;
  title: string | null;
  content: string;
  locale: string;
  when: string | null;
  verified: boolean;
};

type Props = {
  summary: string;
  reviews: Review[];
  labels: { rating: (rating: number) => string; verified: string };
};

/** The tour's approved reviews: average and count, then the newest three. Hidden when empty. */
export function ReviewSummary({ summary, reviews, labels }: Props) {
  if (reviews.length === 0) return null;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-body font-semibold">{summary}</p>
      <ul className="grid gap-6 md:grid-cols-2">
        {reviews.map((review) => (
          <li key={review.id} lang={review.locale}>
            <figure className="flex h-full flex-col gap-3 border-t border-gold pt-5">
              <p className="flex gap-0.5" role="img" aria-label={labels.rating(review.rating)}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    aria-hidden="true"
                    strokeWidth={1.5}
                    className={"h-4 w-4 " + (index < review.rating ? "fill-gold text-gold" : "text-warm-gray")}
                  />
                ))}
              </p>
              <blockquote className="flex flex-col gap-2">
                {review.title && <p className="font-serif text-h4 font-semibold">{review.title}</p>}
                <p className="line-clamp-6 text-body">{review.content}</p>
              </blockquote>
              <figcaption className="mt-auto text-small text-muted-foreground">
                {[review.authorName, review.authorCountry, review.when].filter(Boolean).join(" · ")}
                {review.verified && <span className="ml-2 font-semibold text-success">{labels.verified}</span>}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
