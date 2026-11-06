import { getTranslations } from "next-intl/server";

import { ResponsiveImage } from "@/components/media/responsive-image";
import { Price } from "@/components/typography/price";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Locale, TourCardItem } from "@/modules/catalog/public/types";

/** "Sắp hết chỗ" from this many seats left on the next departure (tour-listing.md L6). */
export const FEW_SEATS_THRESHOLD = 4;

type Props = {
  tour: TourCardItem;
  locale: Locale;
  /** Seat badges only where the data is live (listing results), never on cached pages (decision 3). */
  showSeats?: boolean;
  /** For the first row of a grid (LCP). */
  priority?: boolean;
  /** Heading level of the title in the page outline. */
  headingLevel?: 2 | 3;
  sizes?: string;
  className?: string;
};

/** Image-led card for one tour; the whole card is one link (docs/specs/tour-listing.md §2.3). */
export async function TourCard({
  tour,
  locale,
  showSeats = false,
  priority = false,
  headingLevel = 3,
  sizes = "(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw",
  className,
}: Props) {
  const t = await getTranslations({ locale, namespace: "TourCard" });
  const Title = `h${headingLevel}` as const;
  const fewSeats =
    showSeats && tour.seatsLeftNext !== null && tour.seatsLeftNext > 0 && tour.seatsLeftNext <= FEW_SEATS_THRESHOLD;

  let departure: string;
  if (tour.type === "private") departure = t("flexible");
  else if (tour.nextDepartureDate) {
    departure = t("departs", { date: formatDate(tour.nextDepartureDate, locale) });
    if (tour.otherDepartureCount > 0) departure += ` · ${t("moreDates", { count: tour.otherDepartureCount })}`;
  } else departure = t("contactForDates");

  return (
    <Link
      href={{ pathname: "/tours/[slug]", params: { slug: tour.slug } }}
      className={cn(
        "group flex flex-col gap-4 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
        className,
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        <ResponsiveImage image={tour.image} sizes={sizes} priority={priority} zoomOnHover />
        {(tour.type === "private" || fewSeats) && (
          <div className="absolute left-3 top-3 flex gap-2">
            {tour.type === "private" && <Badge variant="secondary">{t("privateTour")}</Badge>}
            {fewSeats && <Badge variant="warning">{t("fewSeats")}</Badge>}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {tour.destinations.length > 0 && (
          <p className="text-eyebrow font-semibold uppercase text-muted-foreground">
            {tour.destinations
              .slice(0, 2)
              .map((destination) => destination.name)
              .join(" · ")}
          </p>
        )}
        <Title className="line-clamp-2 text-balance font-serif text-h3 font-semibold">{tour.title}</Title>
        <p className="text-small text-muted-foreground">
          {t("duration", { days: tour.durationDays, nights: tour.durationNights })}
          <span aria-hidden="true"> · </span>
          <span className="sr-only">. </span>
          {departure}
        </p>
        {tour.displayPrice > 0 ? (
          <Price amount={tour.displayPrice} locale={locale} prefix={t("from")} suffix={t("perGuest")} />
        ) : (
          <p className="text-body font-semibold">{t("priceOnRequest")}</p>
        )}
      </div>
    </Link>
  );
}
