import { formatVnd } from "@/lib/money";

import { type BaseEmailProps, CustomerEmail, formatDateTime } from "./components/booking";
import { ButtonLink, Text } from "./components/layout";

export type PaymentLinkProps = BaseEmailProps & {
  name: string;
  amount: number;
  kind: "deposit" | "full" | "balance";
  /** The single-use link (4D). It appears only in this body, never in logs. */
  url: string;
  expiresAt: string;
};

/** A payment link from sales: a quote for a private trip, or a balance (4D). */
export function PaymentLinkEmail(props: PaymentLinkProps) {
  const { t, locale, booking, amount, kind, url, expiresAt } = props;
  const formatted = formatVnd(amount, locale);
  return (
    <CustomerEmail
      {...props}
      preview={t("paymentLink.preview", { code: booking.code })}
      eyebrow={t("paymentLink.eyebrow")}
      heading={t("paymentLink.heading")}
      amounts={false}
    >
      <Text>{t("paymentLink.intro", { tour: booking.tourTitle, code: booking.code })}</Text>
      <Text>{t(`paymentLink.kind.${kind}`, { amount: formatted })}</Text>
      <ButtonLink href={url}>{t("paymentLink.button", { amount: formatted })}</ButtonLink>
      <Text muted>{t("paymentLink.expiry", { time: formatDateTime(expiresAt, locale) })}</Text>
      <Text muted>{t("paymentLink.private")}</Text>
    </CustomerEmail>
  );
}
