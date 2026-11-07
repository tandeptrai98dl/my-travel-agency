import type { EmailLocale, EmailT } from "./components/booking";
import { type DetailRow, Details, type EmailBrand, EmailLayout, Eyebrow, Heading, SignOff, Text } from "./components/layout";

export type InquirySource = "tailor_made" | "tour_inquiry" | "contact";

/** What the inquiry emails show. Contact details and the message stay out of the customer copy. */
export type InquiryFacts = {
  code: string;
  source: InquirySource;
  name: string;
  /** The linked tour's title in the email's language (or its code). */
  tourTitle: string | null;
  /** `YYYY-MM`. */
  travelMonth: string | null;
  flexibleDates: boolean;
  durationDays: number | null;
  adults: number | null;
  children: number;
};

/** "03/2027" (vi) or "March 2027" (en). */
export function formatTravelMonth(month: string, locale: EmailLocale): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  if (locale === "vi") return `${match[2]}/${match[1]}`;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Code, kind of request, journey, timing, length and party: only the rows the inquiry has. */
export function inquiryRows(t: EmailT, locale: EmailLocale, inquiry: InquiryFacts): DetailRow[] {
  const rows: DetailRow[] = [
    { label: t("inquiryReceived.code"), value: inquiry.code },
    { label: t("inquiryReceived.request"), value: t(`inquiryReceived.sources.${inquiry.source}`) },
  ];
  if (inquiry.tourTitle) rows.push({ label: t("inquiryReceived.journey"), value: inquiry.tourTitle });
  if (inquiry.travelMonth) {
    const month = formatTravelMonth(inquiry.travelMonth, locale);
    rows.push({ label: t("inquiryReceived.month"), value: inquiry.flexibleDates ? t("inquiryReceived.flexible", { month }) : month });
  }
  if (inquiry.durationDays) rows.push({ label: t("inquiryReceived.duration"), value: t("inquiryReceived.durationValue", { count: inquiry.durationDays }) });
  if (inquiry.adults) {
    const parts = [t("common.adults", { count: inquiry.adults })];
    if (inquiry.children > 0) parts.push(t("common.children", { count: inquiry.children }));
    rows.push({ label: t("inquiryReceived.travellers"), value: parts.join(", ") });
  }
  return rows;
}

export type InquiryReceivedProps = { locale: EmailLocale; t: EmailT; brand: EmailBrand; inquiry: InquiryFacts };

/**
 * The customer's acknowledgement (spec Phase 5 decision 9), in the inquiry's language: the code
 * to quote, what was asked, and that a person will reply. No promise of a reply time: that is a
 * business commitment the owner has not made yet.
 */
export function InquiryReceivedEmail({ locale, t, brand, inquiry }: InquiryReceivedProps) {
  const help =
    brand.email && brand.phone
      ? t("common.helpBoth", { email: brand.email, phone: brand.phone })
      : brand.email
        ? t("common.helpEmail", { email: brand.email })
        : brand.phone
          ? t("common.helpPhone", { phone: brand.phone })
          : null;
  const intro =
    inquiry.source === "tour_inquiry" && inquiry.tourTitle
      ? t("inquiryReceived.intro.tour_inquiry", { tour: inquiry.tourTitle })
      : t(`inquiryReceived.intro.${inquiry.source === "tour_inquiry" ? "tailor_made" : inquiry.source}`);
  return (
    <EmailLayout lang={locale} preview={t("inquiryReceived.preview", { code: inquiry.code })} brand={brand} reason={t("inquiryReceived.reason", { brand: brand.name })}>
      <Eyebrow>{t("inquiryReceived.eyebrow")}</Eyebrow>
      <Heading>{t("inquiryReceived.heading")}</Heading>
      <Text>{t("common.greeting", { name: inquiry.name })}</Text>
      <Text>{intro}</Text>
      <Details rows={inquiryRows(t, locale, inquiry)} />
      <Text>{t("inquiryReceived.keepCode", { code: inquiry.code })}</Text>
      {help && <Text muted>{help}</Text>}
      <SignOff closing={t("common.closing")} team={t("common.team", { brand: brand.name })} />
    </EmailLayout>
  );
}
