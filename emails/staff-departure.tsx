import type { EmailLocale, EmailT } from "./components/booking";
import { ButtonLink, type DetailRow, Details, type EmailBrand, EmailLayout, Eyebrow, Heading, Text } from "./components/layout";

export type MinPaxFacts = {
  tourCode: string;
  tourTitle: string;
  /** Vietnam dates, already formatted. */
  startDate: string;
  daysLeft: number;
  confirmed: number;
  minPax: number;
};

export type StaffDepartureProps = { locale: EmailLocale; t: EmailT; brand: EmailBrand; departure: MinPaxFacts; adminUrl: string };

/**
 * The minimum-traveller alert to `settings.contact.email` (spec Phase 5 decision 11), always in
 * Vietnamese (ADR-006): a departure within 21 days below its tour's minimum. Operators decide;
 * nothing is cancelled automatically. No customer details.
 */
export function StaffDepartureEmail({ locale, t, brand, departure, adminUrl }: StaffDepartureProps) {
  const rows: DetailRow[] = [
    { label: t("staffMinPax.tour"), value: `${departure.tourCode} · ${departure.tourTitle}` },
    { label: t("staffMinPax.date"), value: departure.startDate },
    { label: t("staffMinPax.daysLeft"), value: t("staffMinPax.days", { count: departure.daysLeft }) },
    { label: t("staffMinPax.confirmed"), value: t("staffMinPax.ofMinimum", { confirmed: departure.confirmed, min: departure.minPax }) },
  ];
  return (
    <EmailLayout lang={locale} preview={t("staffMinPax.preview", { code: departure.tourCode, date: departure.startDate })} brand={brand} reason={t("common.staffReason")}>
      <Eyebrow>{t("staffMinPax.eyebrow")}</Eyebrow>
      <Heading>{t("staffMinPax.heading", { code: departure.tourCode, date: departure.startDate })}</Heading>
      <Text>{t("staffMinPax.intro", { count: departure.daysLeft })}</Text>
      <Details rows={rows} />
      <Text muted>{t("staffMinPax.decide")}</Text>
      <ButtonLink href={adminUrl}>{t("common.openAdmin")}</ButtonLink>
    </EmailLayout>
  );
}
