import { formatDateRange } from "@/lib/dates";
import { formatVnd } from "@/lib/money";

import { balanceOf, type BaseEmailProps, CustomerEmail } from "./components/booking";
import { ButtonLink, Text } from "./components/layout";

export type BalanceReminderProps = BaseEmailProps & {
  name: string;
  checkoutUrl: string | null;
};

/** A reminder before the balance is due (scheduled in Phase 5; never cancels anything, ADR-016). */
export function BalanceReminderEmail(props: BalanceReminderProps) {
  const { t, locale, booking, checkoutUrl } = props;
  const amount = formatVnd(balanceOf(booking), locale);
  return (
    <CustomerEmail
      {...props}
      preview={t("balanceReminder.preview", { code: booking.code })}
      eyebrow={t("balanceReminder.eyebrow")}
      heading={t("balanceReminder.heading")}
      amounts
    >
      <Text>
        {booking.balanceDueDate
          ? t("balanceReminder.intro", {
              amount,
              code: booking.code,
              date: formatDateRange(booking.balanceDueDate, booking.balanceDueDate, locale),
            })
          : t("balanceReminder.introNoDate", { amount, code: booking.code })}
      </Text>
      {checkoutUrl && <ButtonLink href={checkoutUrl}>{t("balanceReminder.button")}</ButtonLink>}
      <Text muted>{t("balanceReminder.ignore")}</Text>
    </CustomerEmail>
  );
}
