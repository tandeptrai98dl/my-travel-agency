import { formatVnd } from "@/lib/money";

import { type BaseEmailProps, CustomerEmail } from "./components/booking";
import { Text } from "./components/layout";

export type PaymentReceivedProps = BaseEmailProps & {
  name: string;
  /** The amount received, or null when it cannot be read from the event. */
  amount: number | null;
  /** The payment was flagged for staff (under- or overpaid, late, after a cancellation). */
  flagged: boolean;
};

/** A payment that did not itself confirm the booking (balance, partial, late or flagged money). */
export function PaymentReceivedEmail(props: PaymentReceivedProps) {
  const { t, locale, booking, amount, flagged } = props;
  return (
    <CustomerEmail
      {...props}
      preview={t("paymentReceived.preview", { code: booking.code })}
      eyebrow={t("paymentReceived.eyebrow")}
      heading={t("paymentReceived.heading")}
      amounts
    >
      <Text>
        {amount !== null
          ? t("paymentReceived.intro", { amount: formatVnd(amount, locale), code: booking.code })
          : t("paymentReceived.introNoAmount", { code: booking.code })}
      </Text>
      {flagged && <Text>{t("paymentReceived.flagged")}</Text>}
    </CustomerEmail>
  );
}
