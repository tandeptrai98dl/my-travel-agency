import type { EmailLocale } from "../../../emails/components/booking";
import { type InquiryFacts, InquiryReceivedEmail, type InquirySource } from "../../../emails/inquiry-received";
import { StaffInquiryEmail } from "../../../emails/staff-inquiry";
import { type BuildContext, type BuiltEmail, emailTranslator } from "@/modules/booking/booking-emails";

/**
 * The two emails of a new inquiry (spec Phase 5 decision 9): the customer's acknowledgement in the
 * inquiry's language and the team alert in Vietnamese. Pure: the service loads the row, renders
 * and sends. Each is keyed on the inquiry (`inquiry_received:<id>`, `inquiry_alert:<id>`), so a
 * retried action or a second call never sends it twice (`email_logs.dedupe_key` is unique).
 */

type Translation = { locale: string; title?: string | null; name?: string | null };

/** The inquiry row an email is built from (service role; see inquiry-emails.repository.ts). */
export type EmailInquiry = {
  id: string;
  code: string;
  name: string;
  email: string;
  locale: EmailLocale;
  source: string | null;
  preferred_contact: string | null;
  company_name: string | null;
  adults: number | null;
  children: number;
  travel_month: string | null;
  flexible_dates: boolean;
  duration_days: number | null;
  budget_per_person: string | null;
  destinations_other: string | null;
  created_at: string;
  tour: { code: string; tour_translations: Translation[] | null } | null;
  style: { key: string; travel_style_translations: Translation[] | null } | null;
  /** Destination names by locale, looked up from `destination_ids`. */
  destinations: { locale: string; name: string }[][];
};

export type PlannedInquiryEmail = { template: "inquiry_received" | "inquiry_alert"; key: string; built: BuiltEmail };

const SOURCES: readonly InquirySource[] = ["tailor_made", "tour_inquiry", "contact"];

/** Unknown or missing sources read as a plain message. */
export function inquirySource(value: string | null): InquirySource {
  return (SOURCES as readonly string[]).includes(value ?? "") ? (value as InquirySource) : "contact";
}

/** A translation in `locale`, else the other language's, else null. */
export function pickTranslation(rows: Translation[] | null | undefined, locale: EmailLocale, field: "title" | "name"): string | null {
  const usable = (rows ?? []).filter((row) => typeof row[field] === "string" && row[field]!.trim());
  const row = usable.find((item) => item.locale === locale) ?? usable[0];
  return row ? row[field]!.trim() : null;
}

export function inquiryFacts(inquiry: EmailInquiry, locale: EmailLocale): InquiryFacts {
  return {
    code: inquiry.code,
    source: inquirySource(inquiry.source),
    name: inquiry.name,
    tourTitle: inquiry.tour ? (pickTranslation(inquiry.tour.tour_translations, locale, "title") ?? inquiry.tour.code) : null,
    travelMonth: inquiry.travel_month,
    flexibleDates: inquiry.flexible_dates,
    durationDays: inquiry.duration_days,
    adults: inquiry.adults,
    children: inquiry.children,
  };
}

export function adminInquiryUrl(inquiryId: string, siteUrl: URL): string {
  return new URL(`/admin/inquiries/${encodeURIComponent(inquiryId)}`, siteUrl).toString();
}

/** Both emails of an inquiry, with their exactly-once keys. */
export function buildInquiryEmails(inquiry: EmailInquiry, context: BuildContext): PlannedInquiryEmail[] {
  const locale = inquiry.locale;
  const t = emailTranslator(locale, context.messages[locale]);
  const facts = inquiryFacts(inquiry, locale);
  const customer: BuiltEmail = {
    to: "customer",
    template: "inquiry_received",
    subject: t("inquiryReceived.subject", { code: inquiry.code }),
    element: InquiryReceivedEmail({ locale, t, brand: context.brand, inquiry: facts }),
  };

  const vi = emailTranslator("vi", context.messages.vi);
  const staffFacts = inquiryFacts(inquiry, "vi");
  const destinations = inquiry.destinations
    .map((names) => pickTranslation(names, "vi", "name"))
    .filter((name): name is string => Boolean(name));
  if (inquiry.destinations_other?.trim()) destinations.push(inquiry.destinations_other.trim());
  const source = vi(`inquiryReceived.sources.${staffFacts.source}`);
  const staff: BuiltEmail = {
    to: "staff",
    template: "inquiry_alert",
    subject: vi("staffInquiry.subject", { code: inquiry.code, source }),
    element: StaffInquiryEmail({
      locale: "vi",
      t: vi,
      brand: context.brand,
      adminUrl: adminInquiryUrl(inquiry.id, context.siteUrl),
      inquiry: {
        ...staffFacts,
        preferredContact: inquiry.preferred_contact,
        companyName: inquiry.company_name,
        destinations,
        styleName: inquiry.style ? (pickTranslation(inquiry.style.travel_style_translations, "vi", "name") ?? inquiry.style.key) : null,
        budget: inquiry.budget_per_person,
        locale,
      },
    }),
  };
  return [
    { template: "inquiry_received", key: `inquiry_received:${inquiry.id}`, built: customer },
    { template: "inquiry_alert", key: `inquiry_alert:${inquiry.id}`, built: staff },
  ];
}
