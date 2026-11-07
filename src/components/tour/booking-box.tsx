import { Mail, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Price } from "@/components/typography/price";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/dates";
import { features } from "@/lib/features";
import type { Locale } from "@/modules/catalog/public/types";

type Props = {
  locale: Locale;
  tour: { code: string; type: "group" | "private"; fromPrice: number; depositPercent: number; minTierPrice: number | null };
  /** Bookable departures, earliest first (live). Empty for private tours. */
  bookable: { startDate: string; priceAdult: number }[];
  contact: { phone: string | null; email: string | null };
};

/**
 * Price and the one primary action of the tour page. Until online booking ships (Phase 4,
 * decision 9) the action opens the contact page with the tour code and the next date, and the
 * hotline is the quieter alternative (before the contact page existed: hotline, then email).
 */
export async function BookingBox({ locale, tour, bookable, contact }: Props) {
  const t = await getTranslations({ locale, namespace: "TourDetail.booking" });
  const isPrivate = tour.type === "private";
  const price = isPrivate
    ? (tour.minTierPrice ?? tour.fromPrice)
    : bookable.length
      ? Math.min(...bookable.map((departure) => departure.priceAdult))
      : tour.fromPrice;
  const next = bookable[0];
  const tel = contact.phone ? `tel:${contact.phone.replace(/[^+\d]/g, "")}` : null;
  const contactPage = features.contactPage;
  const mail = !contactPage && contact.email ? `mailto:${contact.email}?subject=${encodeURIComponent(t("emailSubject", { code: tour.code }))}` : null;

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 md:p-8">
      <div className="flex flex-col gap-1">
        {price > 0 ? (
          <Price amount={price} locale={locale} prefix={t("from")} suffix={t("perGuest")} size="lg" />
        ) : (
          <p className="font-serif text-h3 font-semibold">{t("priceOnRequest")}</p>
        )}
        <p className="text-small text-muted-foreground">{isPrivate ? t("privateNote") : t("priceNote")}</p>
      </div>
      {!isPrivate && (
        <p className="border-t border-border pt-4 text-body">
          {next ? t("next", { date: formatDate(next.startDate, locale) }) : t("noDate")}{" "}
          <a href="#departures" className="whitespace-nowrap text-small underline decoration-gold underline-offset-4">
            {t("seeDepartures")}
          </a>
        </p>
      )}
      <div className="flex flex-col gap-3">
        {contactPage && (
          <Button asChild size="lg" className="h-auto min-h-12 whitespace-normal py-3 text-center">
            <Link href={{ pathname: "/contact", query: { tour: tour.code, ...(next && !isPrivate ? { date: next.startDate } : {}) } }}>
              {isPrivate ? t("contactPrivate") : t("contact")}
            </Link>
          </Button>
        )}
        {tel && (
          <Button asChild variant={contactPage ? "secondary" : "default"} size="lg" className="h-auto min-h-12 whitespace-normal py-3 text-center">
            <a href={tel}>
              <Phone aria-hidden="true" strokeWidth={1.5} />
              {isPrivate ? t("callPrivate", { phone: contact.phone! }) : t("call", { phone: contact.phone! })}
            </a>
          </Button>
        )}
        {mail && (
          <Button asChild variant={tel ? "secondary" : "default"} size="lg" className="h-auto min-h-12 whitespace-normal py-3 text-center">
            <a href={mail}>
              <Mail aria-hidden="true" strokeWidth={1.5} />
              {t("email")}
            </a>
          </Button>
        )}
      </div>
      <p className="text-small text-muted-foreground">{t("note", { deposit: tour.depositPercent })}</p>
    </div>
  );
}
