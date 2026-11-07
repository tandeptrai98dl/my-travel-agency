import { formatDateTime, type BaseEmailProps, CustomerEmail } from "./components/booking";
import { ButtonLink, Text } from "./components/layout";

export type BookingLookupProps = BaseEmailProps & {
  name: string;
  checkoutUrl: string;
  /** When the single-use link stops working. */
  expiresAt: string;
};

/**
 * The guest booking lookup (spec Phase 5 decision 7): one button to the booking, valid once and
 * for a short time. Sent only when the code and the address matched; the form never says whether
 * they did.
 */
export function BookingLookupEmail(props: BookingLookupProps) {
  const { t, locale, booking, checkoutUrl, expiresAt } = props;
  return (
    <CustomerEmail
      {...props}
      preview={t("bookingLookup.preview", { code: booking.code })}
      eyebrow={t("bookingLookup.eyebrow")}
      heading={t("bookingLookup.heading")}
      amounts={false}
    >
      <Text>{t("bookingLookup.intro", { code: booking.code })}</Text>
      <ButtonLink href={checkoutUrl}>{t("bookingLookup.button")}</ButtonLink>
      <Text muted>{t("bookingLookup.expiry", { time: formatDateTime(expiresAt, locale) })}</Text>
      <Text muted>{t("bookingLookup.ignore")}</Text>
    </CustomerEmail>
  );
}
