import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/layout/section";
import { TourCard } from "@/components/tour/tour-card";
import { SectionHeading } from "@/components/typography/section-heading";
import { Link } from "@/i18n/navigation";
import type { Locale, TourCardItem } from "@/modules/catalog/public/types";

type Props = { locale: Locale; tours: TourCardItem[] };

/** Three featured tours (`is_featured`) and a link to the listing; left out when none. */
export async function FeaturedTours({ locale, tours }: Props) {
  if (tours.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "Home.featured" });
  return (
    <Section tone="ivory" aria-labelledby="home-featured">
      <div className="flex flex-col gap-10 md:gap-14">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionHeading eyebrow={t("eyebrow")} title={<span id="home-featured">{t("title")}</span>} />
          <ArrowLink href="/tours">{t("viewAll")}</ArrowLink>
        </div>
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {tours.map((tour) => (
            <TourCard key={tour.id} tour={tour} locale={locale} sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw" />
          ))}
        </div>
      </div>
    </Section>
  );
}

/** Underlined text link with an arrow (DESIGN_SYSTEM.md "Motion": underline drawn on hover). */
export function ArrowLink({ href, children }: { href: "/tours" | "/journal"; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-11 items-center gap-2 self-start text-small font-medium underline decoration-gold decoration-1 underline-offset-[6px] hover:decoration-2 md:self-auto"
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-luxe group-hover:translate-x-1 motion-reduce:transition-none" strokeWidth={1.5} aria-hidden="true" />
    </Link>
  );
}
