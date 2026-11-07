import { formatVnd } from "@/lib/money";

import { type BaseEmailProps, bookingRows } from "./components/booking";
import { ButtonLink, Details, EmailLayout, Eyebrow, Heading, Text } from "./components/layout";

export type StaffBookingProps = BaseEmailProps & {
  kind: "confirmed" | "attention";
  /** The translated "needs attention" reason (attention only). */
  reason?: string;
  adminUrl: string;
};

/**
 * Team alerts to `settings.contact.email`, always in Vietnamese (the admin language, ADR-006):
 * a confirmed booking, or a booking that needs attention. Only the booking facts and a link to
 * the admin; customer contact details stay in the admin.
 */
export function StaffBookingEmail(props: StaffBookingProps) {
  const { t, locale, brand, booking, kind, reason, adminUrl } = props;
  const key = kind === "confirmed" ? "staffConfirmed" : "staffAttention";
  return (
    <EmailLayout lang={locale} preview={t(`${key}.preview`, { code: booking.code })} brand={brand} reason={t("common.staffReason")}>
      <Eyebrow>{t(`${key}.eyebrow`)}</Eyebrow>
      <Heading>{t(`${key}.heading`, { code: booking.code })}</Heading>
      {kind === "attention" && reason && <Text>{t("staffAttention.reason", { reason })}</Text>}
      {kind === "confirmed" && <Text>{t("staffConfirmed.intro", { paid: formatVnd(booking.amountPaid, locale) })}</Text>}
      <Details rows={bookingRows(t, locale, booking, true)} />
      <ButtonLink href={adminUrl}>{t("common.openAdmin")}</ButtonLink>
    </EmailLayout>
  );
}
