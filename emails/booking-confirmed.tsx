import { formatDateRange } from "@/lib/dates";
import { formatVnd } from "@/lib/money";

import { balanceOf, type BaseEmailProps, CustomerEmail } from "./components/booking";
import { ButtonLink, Rule, Text } from "./components/layout";

export type BookingConfirmedProps = BaseEmailProps & {
  name: string;
  /** The cancellation policy summary snapshotted on the booking, in its language. */
  policySummary: string | null;
  checkoutUrl: string | null;
};

/** Sent once when the booking becomes `confirmed` (deposit or full price received). */
export function BookingConfirmedEmail(props: BookingConfirmedProps) {
  const { t, locale, booking, policySummary, checkoutUrl } = props;
  const balance = balanceOf(booking);
  return (
    <CustomerEmail
      {...props}
      preview={t("bookingConfirmed.preview", { code: booking.code })}
      eyebrow={t("bookingConfirmed.eyebrow")}
      heading={t("bookingConfirmed.heading")}
      amounts
      after={
        policySummary ? (
          <>
            <Rule />
            <Text style={{ fontWeight: 600, marginBottom: 8 }}>{t("bookingConfirmed.policy")}</Text>
            <Text muted>{policySummary}</Text>
          </>
        ) : null
      }
    >
      <Text>{t("bookingConfirmed.intro", { code: booking.code, tour: booking.tourTitle })}</Text>
      {balance > 0 && booking.balanceDueDate && (
        <Text>
          {t("bookingConfirmed.balance", {
            amount: formatVnd(balance, locale),
            date: formatDateRange(booking.balanceDueDate, booking.balanceDueDate, locale),
          })}
        </Text>
      )}
      <Text>{t("bookingConfirmed.next")}</Text>
      {checkoutUrl && <ButtonLink href={checkoutUrl}>{t("bookingConfirmed.button")}</ButtonLink>}
    </CustomerEmail>
  );
}
