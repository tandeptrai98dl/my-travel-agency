"use client";

import { useTranslations } from "next-intl";

import type { Quote } from "@/modules/booking/pricing";
import { formatVnd } from "@/lib/money";
import { formatDate } from "@/lib/dates";

/** The server's price for the current choices (never computed in the browser). */
export function PriceSummary({ quote, locale, pending }: { quote: Quote | null; locale: "vi" | "en"; pending: boolean }) {
  const t = useTranslations("Booking");
  return (
    <div aria-live="polite" aria-busy={pending} className="flex flex-col gap-3 text-small">
      {quote ? (
        <>
          <ul className="flex flex-col gap-2">
            {quote.lines.map((line) => (
              <li key={line.type} className="flex items-baseline justify-between gap-4">
                <span>{t("lineQuantity", { label: t(`lines.${line.type}`), quantity: line.quantity })}</span>
                <span className="tabular-nums">{formatVnd(line.amount, locale)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 text-body font-semibold">
            <span>{t("total")}</span>
            <span className="tabular-nums" data-testid="booking-total">{formatVnd(quote.total, locale)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span>{t("dueToday")}</span>
            <span className="tabular-nums font-medium">{formatVnd(quote.deposit, locale)}</span>
          </div>
          {quote.balanceDueDate && (
            <div className="flex items-baseline justify-between gap-4 text-muted-foreground">
              <span>{t("balanceLater", { date: formatDate(quote.balanceDueDate, locale) })}</span>
              <span className="tabular-nums">{formatVnd(quote.total - quote.deposit, locale)}</span>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">{pending ? t("pricing") : "—"}</p>
      )}
      <p className="text-muted-foreground">{t("priceNote")}</p>
    </div>
  );
}
