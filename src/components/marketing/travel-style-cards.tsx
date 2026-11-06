import { getTranslations } from "next-intl/server";

import { Section } from "@/components/layout/section";
import { ResponsiveImage } from "@/components/media/responsive-image";
import { SectionHeading } from "@/components/typography/section-heading";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/modules/catalog/public/types";
import type { HomeTravelStyle } from "@/modules/content/public/homepage.mapping";

type Props = { locale: Locale; styles: HomeTravelStyle[] };

/**
 * Up to four travel styles as portrait cards on white. Each opens the tour listing filtered by
 * that style (decision 18) until the style pages exist (PR J). Left out when none.
 */
export async function TravelStyleCards({ locale, styles }: Props) {
  if (styles.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "Home.styles" });
  return (
    <Section tone="white" aria-labelledby="home-styles">
      <div className="flex flex-col gap-10 md:gap-14">
        <SectionHeading eyebrow={t("eyebrow")} title={<span id="home-styles">{t("title")}</span>} />
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4 lg:gap-8">
          {styles.slice(0, 4).map((style) => (
            <li key={style.key}>
              <Link
                href={{ pathname: "/tours", query: { style: style.key } }}
                className="group flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                  <ResponsiveImage image={style.image} sizes="(min-width: 1024px) 300px, 50vw" zoomOnHover />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-serif text-h3 font-medium md:text-h3-lg">{style.name}</h3>
                  {style.description && <p className="line-clamp-3 text-small text-muted-foreground">{style.description}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
