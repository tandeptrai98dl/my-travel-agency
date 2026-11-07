import { TourCard } from "@/components/tour/tour-card";
import type { Locale, TourCardItem } from "@/modules/catalog/public/types";

/** Grid of live tour cards (seat badges on; the first row's images load first). */
export function TourGrid({ tours, locale, headingLevel = 3 }: { tours: TourCardItem[]; locale: Locale; headingLevel?: 2 | 3 }) {
  return (
    <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
      {tours.map((tour, index) => (
        <li key={tour.id}>
          <TourCard
            tour={tour}
            locale={locale}
            showSeats
            headingLevel={headingLevel}
            priority={index < 3}
            sizes="(min-width: 1280px) 330px, (min-width: 640px) 45vw, 100vw"
          />
        </li>
      ))}
    </ul>
  );
}
