import NextLink from "next/link";

import { TourCard } from "@/components/tour/tour-card";
import { SectionHeading } from "@/components/typography/section-heading";
import { buttonVariants } from "@/components/ui/button-variants";
import type { Locale, TourCardItem } from "@/modules/catalog/public/types";

type Props = {
  id: string;
  locale: Locale;
  eyebrow: string;
  title: string;
  tours: TourCardItem[];
  /** Shown instead of the grid when there are no tours (with its own actions). */
  empty: React.ReactNode;
  /** The full, filterable list in the tour listing (`/tours?dest=<key>` or `?style=<key>`). */
  seeAll?: { href: string; label: string };
};

/** Cards shown here; the rest are one click away in the listing. */
export const SECTION_TOUR_LIMIT = 9;

/** A titled grid of tour cards (cached data: no seat badges), or an empty state. */
export function TourGridSection({ id, locale, eyebrow, title, tours, empty, seeAll }: Props) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-10 border-t border-border py-16 md:py-24">
      <SectionHeading eyebrow={eyebrow} title={<span id={id}>{title}</span>} />
      {tours.length === 0 ? (
        empty
      ) : (
        <>
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {tours.slice(0, SECTION_TOUR_LIMIT).map((tour) => (
              <TourCard key={tour.id} tour={tour} locale={locale} sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw" />
            ))}
          </div>
          {seeAll && (
            <NextLink href={seeAll.href} className={buttonVariants({ variant: "outline", className: "self-start" })}>
              {seeAll.label}
            </NextLink>
          )}
        </>
      )}
    </section>
  );
}
