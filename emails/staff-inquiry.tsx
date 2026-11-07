import type { EmailLocale, EmailT } from "./components/booking";
import { ButtonLink, type DetailRow, Details, type EmailBrand, EmailLayout, Eyebrow, Heading, Text } from "./components/layout";
import { type InquiryFacts, inquiryRows } from "./inquiry-received";

export type StaffInquiryFacts = InquiryFacts & {
  preferredContact: string | null;
  companyName: string | null;
  /** Destination names (Vietnamese) and the customer's own words. */
  destinations: string[];
  styleName: string | null;
  budget: string | null;
  locale: EmailLocale;
};

export type StaffInquiryProps = { locale: EmailLocale; t: EmailT; brand: EmailBrand; inquiry: StaffInquiryFacts; adminUrl: string };

const has = (t: EmailT, key: string) => {
  try {
    return t(key);
  } catch {
    return null;
  }
};

/**
 * The new-inquiry alert to `settings.contact.email`, always in Vietnamese (the admin language,
 * ADR-006). What the request is about and a link to the inbox; like the booking alerts, the
 * customer's email, phone and message stay in the admin.
 */
export function StaffInquiryEmail({ locale, t, brand, inquiry, adminUrl }: StaffInquiryProps) {
  const source = t(`inquiryReceived.sources.${inquiry.source}`);
  const rows: DetailRow[] = [{ label: t("staffInquiry.name"), value: inquiry.name }];
  if (inquiry.preferredContact) {
    rows.push({ label: t("staffInquiry.channel"), value: has(t, `staffInquiry.channels.${inquiry.preferredContact}`) ?? inquiry.preferredContact });
  }
  if (inquiry.companyName) rows.push({ label: t("staffInquiry.company"), value: inquiry.companyName });
  rows.push(...inquiryRows(t, locale, inquiry));
  if (inquiry.destinations.length > 0) rows.push({ label: t("staffInquiry.destinations"), value: inquiry.destinations.join(", ") });
  if (inquiry.styleName) rows.push({ label: t("staffInquiry.style"), value: inquiry.styleName });
  if (inquiry.budget) rows.push({ label: t("staffInquiry.budget"), value: has(t, `staffInquiry.budgets.${inquiry.budget}`) ?? inquiry.budget });
  rows.push({ label: t("staffInquiry.language"), value: t(`staffInquiry.languages.${inquiry.locale}`) });
  return (
    <EmailLayout lang={locale} preview={t("staffInquiry.preview", { name: inquiry.name, code: inquiry.code })} brand={brand} reason={t("common.staffReason")}>
      <Eyebrow>{t("staffInquiry.eyebrow")}</Eyebrow>
      <Heading>{t("staffInquiry.heading", { code: inquiry.code })}</Heading>
      <Text>{t("staffInquiry.intro", { name: inquiry.name, source })}</Text>
      <Details rows={rows} />
      <Text muted>{t("staffInquiry.contactHint")}</Text>
      <ButtonLink href={adminUrl}>{t("common.openAdmin")}</ButtonLink>
    </EmailLayout>
  );
}
