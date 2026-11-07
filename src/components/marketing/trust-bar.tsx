import { BadgeCheck, Clock, CreditCard, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import type { Locale } from "@/modules/catalog/public/types";
import type { PublicSettings } from "@/modules/settings/settings.schemas";

type Props = {
  locale: Locale;
  settings: PublicSettings;
  /** Online booking and payment can run (`onlineBookingAvailable()`). */
  onlinePayment: boolean;
};

/**
 * Trust signals from real data only (decision 19): the licence and legal name from
 * `settings.company`, office hours and hotline from `settings.contact`, and the payment methods
 * only while online payment can really run. Items without data are left out; nothing is invented.
 */
export async function TrustBar({ locale, settings, onlinePayment }: Props) {
  const t = await getTranslations({ locale, namespace: "Home.trust" });
  const company = settings.company;
  const contact = settings.contact;
  const hours = contact?.office_hours?.[locale]?.trim();
  const items = [
    company?.tour_operator_licence && { icon: BadgeCheck, text: t("licence", { number: company.tour_operator_licence }) },
    company?.legal_name && !company.tour_operator_licence && { icon: BadgeCheck, text: t("company", { name: company.legal_name }) },
    hours && { icon: Clock, text: t("hours", { hours }) },
    contact?.phone && { icon: Phone, text: t("hotline", { phone: contact.phone }) },
    onlinePayment && { icon: CreditCard, text: t("payments") },
  ].filter((item): item is { icon: typeof Clock; text: string } => Boolean(item));
  if (items.length === 0) return null;

  return (
    <section aria-label={t("label")} className="border-b border-border bg-card text-card-foreground">
      <Container>
        <ul className="flex flex-col gap-4 py-6 md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-x-12 md:py-7">
          {items.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-small">
              <Icon className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
