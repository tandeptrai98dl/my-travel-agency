import { getTranslations } from "next-intl/server";

import { ResponsiveImage } from "@/components/media/responsive-image";
import { Link } from "@/i18n/navigation";
import { cx } from "@/lib/cx";
import type { DestinationSummary } from "@/modules/catalog/public/destination-public.mapping";
import type { Locale } from "@/modules/catalog/public/types";

type Props = {
  destination: DestinationSummary;
  locale: Locale;
  headingLevel?: 2 | 3;
  /** `wide` (3:2) for large editorial cards, `portrait` (4:5) for grids. */
  shape?: "wide" | "portrait";
  sizes?: string;
  priority?: boolean;
};

/** Image-led card for one destination: name, number of tours and best time; one link. */
export async function DestinationCard({ destination, locale, headingLevel = 3, shape = "portrait", sizes, priority = false }: Props) {
  const t = await getTranslations({ locale, namespace: "Destinations" });
  const Title = `h${headingLevel}` as const;
  return (
    <Link
      href={{ pathname: "/destinations/[slug]", params: { slug: destination.slug } }}
      className="group flex flex-col gap-4 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <div className={cx("relative overflow-hidden bg-muted", shape === "wide" ? "aspect-[3/2]" : "aspect-[4/5]")}>
        <ResponsiveImage
          image={destination.image}
          sizes={sizes ?? (shape === "wide" ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 300px, 50vw")}
          priority={priority}
          zoomOnHover
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Title className="text-balance font-serif text-h3 font-medium md:text-h3-lg">{destination.name}</Title>
        <p className="text-small text-muted-foreground">
          {t("tourCount", { count: destination.tourCount })}
          {destination.bestTime && ` · ${t("bestTime", { value: destination.bestTime })}`}
        </p>
      </div>
    </Link>
  );
}
