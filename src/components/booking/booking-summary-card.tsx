import { getTranslations } from "next-intl/server";

import { formatDate } from "@/lib/dates";
import { formatVnd } from "@/lib/money";
import type { CheckoutView } from "@/modules/booking/checkout.service";

/** The booking as the customer sees it at checkout: no internal fields. */
export async function BookingSummaryCard({ view }: { view: CheckoutView }) {
  const t = await getTranslations({ locale: view.locale, namespace: "Checkout" });
  const lines = await getTranslations({ locale: view.locale, namespace: "Booking" });
  const vnd = (amount: number) => formatVnd(amount, view.locale);
  return (
    <section aria-labelledby="checkout-summary" className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
      <h2 id="checkout-summary" className="font-serif text-h3 font-semibold">
        {t("trip")}
      </h2>
      <dl className="grid gap-4 text-small sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t("trip")}</dt>
          <dd className="text-body font-medium">{view.tourTitle}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("date")}</dt>
          <dd className="text-body">{formatDate(view.startDate, view.locale)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("statusLabel")}</dt>
          <dd className="text-body" data-testid="checkout-status">{t(`statuses.${view.status}`)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("contact")}</dt>
          <dd className="break-all text-body">{view.contactName} · {view.contactEmail}</dd>
        </div>
        <div className="sm:col-span-2">
          <dd>{t("party", { adults: view.party.adults, children: view.party.children, infants: view.party.infants })}</dd>
        </div>
      </dl>
      <ul className="flex flex-col gap-2 border-t border-border pt-4 text-small">
        {view.lines.map((line) => (
          <li key={line.type} className="flex justify-between gap-4">
            <span>{lines("lineQuantity", { label: lines.has(`lines.${line.type}`) ? lines(`lines.${line.type}` as "lines.adult") : line.type, quantity: line.quantity })}</span>
            <span className="tabular-nums">{vnd(line.amount)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-4 border-t border-border pt-3 text-body font-semibold">
          <span>{lines("total")}</span>
          <span className="tabular-nums">{vnd(view.total)}</span>
        </li>
        <li className="flex justify-between gap-4">
          <span>{t("paid")}</span>
          <span className="tabular-nums">{vnd(view.amountPaid)}</span>
        </li>
        {view.amountPaid < view.total && (
          <li className="flex justify-between gap-4">
            <span>{t("remaining")}</span>
            <span className="tabular-nums">{vnd(view.total - view.amountPaid)}</span>
          </li>
        )}
      </ul>
      {view.policySummary && (
        <div className="border-t border-border pt-4 text-small">
          <h3 className="font-semibold">{t("policy")}</h3>
          <p className="mt-1 text-muted-foreground">{view.policySummary}</p>
        </div>
      )}
    </section>
  );
}
