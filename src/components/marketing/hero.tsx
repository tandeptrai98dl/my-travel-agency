import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { ResponsiveImage } from "@/components/media/responsive-image";
import { Eyebrow } from "@/components/typography/eyebrow";
import type { IsoMonth } from "@/lib/dates";
import type { ImageData } from "@/lib/images";
import type { DestinationNode } from "@/modules/catalog/destinations";
import type { Locale } from "@/modules/catalog/public/types";

import { HeroSearch } from "./hero-search";

type Props = {
  locale: Locale;
  eyebrow: string | null;
  title: string | null;
  image: ImageData | null;
  destinations: DestinationNode[];
  styles: { key: string; name: string }[];
  months: IsoMonth[];
};

/**
 * Homepage hero under the transparent header: the `homepage` setting's eyebrow and title on the
 * navy band, over the optional hero photo (decision 18) when it exists with alt text. A missing or
 * broken photo leaves the navy band, never a frame or an alt-less image.
 */
export async function Hero({ locale, eyebrow, title, image, destinations, styles, months }: Props) {
  const t = await getTranslations({ locale, namespace: "Home.hero" });
  return (
    <section className="theme-navy relative isolate flex min-h-[88svh] flex-col justify-end overflow-hidden bg-background pb-12 pt-32 text-foreground md:min-h-[90vh] md:justify-center md:pb-20">
      {image && (
        <div className="absolute inset-0 -z-10">
          <ResponsiveImage image={image} sizes="100vw" priority fallback="none" />
          {/* Keeps the text block at 4.5:1 or more on any photo, even a white one (WCAG 1.4.3):
              behind the text the navy is at least 85-90% opaque (bottom on mobile, left on desktop). */}
          <div
            className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-background/50 md:bg-gradient-to-r md:from-background md:via-background/85 md:to-background/20"
            aria-hidden="true"
          />
        </div>
      )}
      <Container className="flex flex-col gap-8 md:gap-10">
        <div className="flex max-w-4xl flex-col gap-5">
          <Eyebrow>{eyebrow ?? t("defaultEyebrow")}</Eyebrow>
          <h1 className="text-balance font-serif text-display font-medium md:text-display-lg">{title ?? t("defaultTitle")}</h1>
          <div aria-hidden="true" className="h-px w-16 bg-gold" />
          <p className={`max-w-2xl text-body-lg md:text-body-lg-lg ${image ? "text-foreground" : "text-muted-foreground"}`}>{t("lead")}</p>
        </div>
        <HeroSearch locale={locale} destinations={destinations} styles={styles} months={months} />
      </Container>
    </section>
  );
}
