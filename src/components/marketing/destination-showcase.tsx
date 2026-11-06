import { getTranslations } from "next-intl/server";

import { Section } from "@/components/layout/section";
import { ResponsiveImage } from "@/components/media/responsive-image";
import { SectionHeading } from "@/components/typography/section-heading";
import { Link } from "@/i18n/navigation";
import { cx } from "@/lib/cx";
import type { Locale } from "@/modules/catalog/public/types";
import type { HomeDestination } from "@/modules/content/public/homepage.mapping";

type Props = {
  locale: Locale;
  destinations: HomeDestination[];
  /** Drops the top padding when the section above has the same ivory tone. */
  flushTop?: boolean;
};

/**
 * Featured destinations as an editorial 7/5 split: the first one large, the next two stacked
 * (one large and two half-width cards on mobile). Each card lists that destination's journeys on
 * the tour listing until the destination pages exist (Phase 3 PR J). Left out when none.
 */
export async function DestinationShowcase({ locale, destinations, flushTop = false }: Props) {
  if (destinations.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "Home.destinations" });
  const [lead, ...rest] = destinations.slice(0, 3);
  return (
    <Section tone="ivory" className={flushTop ? "pt-0 md:pt-0" : undefined} aria-labelledby="home-destinations">
      <div className="flex flex-col gap-10 md:gap-14">
        <SectionHeading eyebrow={t("eyebrow")} title={<span id="home-destinations">{t("title")}</span>} />
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-12 lg:gap-8">
          <li className="col-span-2 lg:col-span-7 lg:row-span-2">
            <DestinationCard destination={lead} large bestTime={lead.bestTime ? t("bestTime", { value: lead.bestTime }) : null} />
          </li>
          {rest.map((destination) => (
            <li key={destination.key} className="col-span-1 lg:col-span-5">
              <DestinationCard
                destination={destination}
                bestTime={destination.bestTime ? t("bestTime", { value: destination.bestTime }) : null}
              />
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

type CardProps = { destination: HomeDestination; large?: boolean; bestTime: string | null };

function DestinationCard({ destination, large = false, bestTime }: CardProps) {
  return (
    <Link
      href={{ pathname: "/tours", query: { dest: destination.key } }}
      className="group flex h-full flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <div className={cx("relative overflow-hidden bg-muted", large ? "aspect-[4/5] sm:aspect-[3/2] lg:aspect-auto lg:min-h-[36rem] lg:flex-1" : "aspect-[4/5] lg:aspect-[3/2]")}>
        <ResponsiveImage
          image={destination.image}
          sizes={large ? "(min-width: 1024px) 58vw, 100vw" : "(min-width: 1024px) 40vw, 50vw"}
          zoomOnHover
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className={cx("text-balance font-serif font-medium", large ? "text-h2 md:text-h2-lg" : "text-h3 md:text-h3-lg")}>{destination.name}</h3>
        {large && destination.summary && <p className="max-w-prose text-body text-muted-foreground">{destination.summary}</p>}
        {bestTime && <p className="text-small text-muted-foreground">{bestTime}</p>}
      </div>
    </Link>
  );
}
