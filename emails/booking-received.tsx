import { formatVnd } from "@/lib/money";

import { type BaseEmailProps, CustomerEmail, formatDateTime } from "./components/booking";
import { ButtonLink, Text } from "./components/layout";

export type BookingReceivedProps = BaseEmailProps & {
  name: string;
  /** What Pay asked for: the deposit or the full price. */
  dueNow: number;
  holdExpiresAt: string | null;
  checkoutUrl: string | null;
};

/** Sent once, when the seats are first held (the booking enters `pending_payment`). */
export function BookingReceivedEmail(props: BookingReceivedProps) {
  const { t, locale, booking, dueNow, holdExpiresAt, checkoutUrl } = props;
  const amount = formatVnd(dueNow, locale);
  return (
    <CustomerEmail
      {...props}
      preview={t("bookingReceived.preview", { code: booking.code })}
      eyebrow={t("bookingReceived.eyebrow")}
      heading={t("bookingReceived.heading")}
      amounts={false}
    >
      <Text>{t("bookingReceived.intro", { tour: booking.tourTitle })}</Text>
      <Text>
        {holdExpiresAt
          ? t("bookingReceived.hold", { time: formatDateTime(holdExpiresAt, locale), amount })
          : t("bookingReceived.holdNoTime", { amount })}
      </Text>
      {checkoutUrl && <ButtonLink href={checkoutUrl}>{t("bookingReceived.button")}</ButtonLink>}
      <Text muted>{t("bookingReceived.lapse")}</Text>
    </CustomerEmail>
  );
}
