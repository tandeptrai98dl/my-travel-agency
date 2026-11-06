import { SectionHeading } from "@/components/typography/section-heading";
import type { Locale, TourCardItem } from "@/modules/catalog/public/types";

import { TourCard } from "./tour-card";

/** Up to three other tours; nothing when there are none. */
export function RelatedTours({ tours, locale, eyebrow, title }: { tours: TourCardItem[]; locale: Locale; eyebrow: string; title: string }) {
  if (tours.length === 0) return null;
  return (
    <section aria-labelledby="related-title" className="flex flex-col gap-10 border-t border-border py-16 md:py-24">
      <SectionHeading eyebrow={eyebrow} title={<span id="related-title">{title}</span>} />
      <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {tours.map((tour) => (
          <TourCard key={tour.id} tour={tour} locale={locale} sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" />
        ))}
      </div>
    </section>
  );
}
