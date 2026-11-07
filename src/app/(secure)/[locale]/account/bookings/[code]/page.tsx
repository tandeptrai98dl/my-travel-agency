import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AccountFrame } from "@/components/account/account-frame";
import { TravellersForm } from "@/components/account/travellers-form";
import { buttonVariants } from "@/components/ui/button-variants";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { getPathname, Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { formatDate, formatDateRange } from "@/lib/dates";
import { formatVnd } from "@/lib/money";
import { getMyBooking, requireCustomer } from "@/modules/account/account.service";

type Props = { params: Promise<{ locale: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Account.booking" });
  return { title: t("metaTitle", { code: code.slice(0, 20) }) };
}

/**
 * One booking of the signed-in customer (decision 4), read only through `customer_booking(code)`:
 * another customer's code, or an unknown one, is a 404.
 */
export default async function AccountBookingPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-[40rem] w-full max-w-7xl" aria-hidden="true" />}>
      <Detail params={params} />
    </Suspense>
  );
}

const shortDate = (value: string, locale: Locale) => formatDate(value.slice(0, 10), locale);

async function Detail({ params }: Props) {
  const { locale, code } = (await params) as { locale: Locale; code: string };
  await requireCustomer(locale, getPathname({ locale, href: { pathname: "/account/bookings/[code]", params: { code } } }));
  const booking = await getMyBooking(code, locale);
  if (!booking) notFound();
  const [t, tTravellers, tCheckout] = await Promise.all([
    getTranslations({ locale, namespace: "Account.booking" }),
    getTranslations({ locale, namespace: "Account.travellers" }),
    getTranslations({ locale, namespace: "Checkout" }),
  ]);
  const dates = booking.endDate ? formatDateRange(booking.startDate, booking.endDate, locale) : formatDate(booking.startDate, locale);
  const payLabel = booking.status === "confirmed" ? t("pay") : t("continue");
  const statusKeys = ["saved", "invalid", "locked", "too_many", "lead_required", "not_found", "expired", "failed"] as const;
  const errorKeys = ["required", "tooLong", "invalidDate", "invalid"] as const;

  return (
    <AccountFrame locale={locale} current="bookings" title={booking.tourTitle ?? booking.code}>
      <Link href="/account/bookings" className="-mt-6 self-start text-small underline decoration-gold underline-offset-4">
        {t("back")}
      </Link>

      <section aria-labelledby="summary-heading" className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
        <h2 id="summary-heading" className="sr-only">
          {booking.code}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-small text-muted-foreground">{booking.code}</p>
          <StatusBadge kind="booking" status={booking.status} label={tCheckout(`statuses.${booking.status}`)} />
          <StatusBadge kind="payment" status={booking.paymentState} label={t(`paymentStates.${booking.paymentState}`)} />
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-small text-muted-foreground">{t("dates")}</dt>
            <dd>{dates}</dd>
          </div>
          <div>
            <dt className="text-small text-muted-foreground">{t("party")}</dt>
            <dd>
              {t("partyValue", booking.party)}
              {booking.party.singleRooms > 0 ? `, ${t("singleRooms", { count: booking.party.singleRooms })}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-small text-muted-foreground">{t("contact")}</dt>
            <dd className="break-words">
              {booking.contact.name} · {booking.contact.email} · {booking.contact.phone}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="price-heading" className="flex flex-col gap-4">
        <h2 id="price-heading" className="font-serif text-h3 font-semibold">
          {t("lines")}
        </h2>
        <dl className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {booking.lines.map((line, index) => (
            <div key={index} className="flex flex-wrap justify-between gap-2 px-5 py-3">
              <dt>
                {line.label} <span className="text-small text-muted-foreground">({t("lineQuantity", { quantity: line.quantity, price: formatVnd(line.unitPrice, locale) })})</span>
              </dt>
              <dd>{formatVnd(line.amount, locale)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-2 px-5 py-3 font-semibold">
            <dt>{t("total")}</dt>
            <dd>{formatVnd(booking.total, locale)}</dd>
          </div>
          <div className="flex justify-between gap-2 px-5 py-3">
            <dt>{t("paid")}</dt>
            <dd>{formatVnd(booking.amountPaid, locale)}</dd>
          </div>
          <div className="flex justify-between gap-2 px-5 py-3">
            <dt>{t("balance")}</dt>
            <dd>{formatVnd(booking.balanceDue, locale)}</dd>
          </div>
        </dl>
        {booking.balanceDueDate && booking.balanceDue > 0 && booking.status === "confirmed" ? (
          <p className="text-small">{t("balanceDue", { date: formatDate(booking.balanceDueDate, locale) })}</p>
        ) : null}
        {booking.payable ? (
          <Link href={{ pathname: "/checkout/[code]", params: { code: booking.code } }} className={buttonVariants({ size: "lg", className: "self-start" })}>
            {payLabel}
          </Link>
        ) : null}
      </section>

      <section aria-labelledby="payments-heading" className="flex flex-col gap-4">
        <h2 id="payments-heading" className="font-serif text-h3 font-semibold">
          {t("payments")}
        </h2>
        {booking.payments.length === 0 ? (
          <p className="text-muted-foreground">{t("noPayments")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[32rem] text-left text-small">
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">{t("paymentDate")}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t("paymentKind")}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t("paymentMethod")}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">{t("paymentAmount")}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t("paymentStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {booking.payments.map((payment, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3">{shortDate(payment.paidAt ?? payment.createdAt, locale)}</td>
                    <td className="px-4 py-3">{t(`kinds.${payment.kind}` as "kinds.deposit")}</td>
                    <td className="px-4 py-3">{t.has(`providers.${payment.provider}`) ? t(`providers.${payment.provider}` as "providers.vnpay") : payment.provider}</td>
                    <td className="px-4 py-3 text-right">
                      {payment.kind === "refund" ? "−" : ""}
                      {formatVnd(payment.amount, locale)}
                    </td>
                    <td className="px-4 py-3">{t(`transactionStatuses.${payment.status}` as "transactionStatuses.pending")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="policy-heading" className="flex max-w-prose flex-col gap-3">
        <h2 id="policy-heading" className="font-serif text-h3 font-semibold">
          {t("policy")}
        </h2>
        <p className="whitespace-pre-line text-body">{booking.cancellationSummary ?? t("noPolicy")}</p>
      </section>

      <section aria-labelledby="travellers-heading" className="flex flex-col gap-4">
        <h2 id="travellers-heading" className="font-serif text-h3 font-semibold">
          {t("travellers")}
        </h2>
        {booking.travellersEditable ? (
          <>
            <p className="max-w-prose text-muted-foreground">{t("travellersIntro")}</p>
            <TravellersForm
              code={booking.code}
              max={booking.maxTravellers}
              initial={booking.travellers.map((traveller) => ({
                fullName: traveller.fullName,
                dateOfBirth: traveller.dateOfBirth ?? "",
                nationality: traveller.nationality ?? "",
                dietaryNotes: traveller.dietaryNotes ?? "",
                isLead: traveller.isLead,
              }))}
              labels={{
                row: tTravellers.raw("row") as string,
                fullName: tTravellers("fullName"),
                dateOfBirth: tTravellers("dateOfBirth"),
                nationality: tTravellers("nationality"),
                dietaryNotes: tTravellers("dietaryNotes"),
                lead: tTravellers("lead"),
                leadLegend: tTravellers("leadLegend"),
                add: tTravellers("add"),
                remove: tTravellers.raw("remove") as string,
                save: tTravellers("save"),
                saving: tTravellers("saving"),
                status: { ...Object.fromEntries(statusKeys.map((key) => [key, tTravellers(`status.${key}`)])), failed: tTravellers("status.failed") },
                errors: { ...Object.fromEntries(errorKeys.map((key) => [key, tTravellers(`errors.${key}`)])), invalid: tTravellers("errors.invalid") },
              }}
            />
          </>
        ) : (
          <>
            <p className="max-w-prose text-muted-foreground">{t("travellersLocked")}</p>
            {booking.travellers.length === 0 ? (
              <p>{t("noTravellers")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {booking.travellers.map((traveller, index) => (
                  <li key={index}>
                    {traveller.fullName}
                    {traveller.isLead ? ` · ${tTravellers("lead")}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </AccountFrame>
  );
}
