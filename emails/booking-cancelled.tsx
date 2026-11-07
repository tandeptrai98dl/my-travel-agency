import { type BaseEmailProps, CustomerEmail } from "./components/booking";
import { Text } from "./components/layout";

export type BookingCancelledProps = BaseEmailProps & { name: string };

/** Sent once when a booking is cancelled. The refund itself is decided and recorded by staff (4F). */
export function BookingCancelledEmail(props: BookingCancelledProps) {
  const { t, booking } = props;
  return (
    <CustomerEmail
      {...props}
      preview={t("bookingCancelled.preview", { code: booking.code })}
      eyebrow={t("bookingCancelled.eyebrow")}
      heading={t("bookingCancelled.heading")}
      amounts={false}
    >
      <Text>{t("bookingCancelled.intro", { code: booking.code, tour: booking.tourTitle })}</Text>
      {booking.amountPaid > 0 && <Text>{t("bookingCancelled.refund")}</Text>}
      <Text>{t("bookingCancelled.farewell")}</Text>
    </CustomerEmail>
  );
}
