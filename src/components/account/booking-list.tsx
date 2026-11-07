import { getTranslations } from "next-intl/server";

import { StatusBadge } from "@/components/ui/status-badge";
import { Link } from "@/i18n/navigation";
import { formatDate, formatDateRange } from "@/lib/dates";
import { formatVnd } from "@/lib/money";
import type { BookingListItem } from "@/modules/account/account.service";

/** Bookings as a list of cards (code, tour, dates, party, money, status). */
export async function BookingList({ locale, bookings }: { locale: "vi" | "en"; bookings: BookingListItem[] }) {
  const [t, tCheckout] = await Promise.all([getTranslations({ locale, namespace: "Account.bookings" }), getTranslations({ locale, namespace: "Checkout" })]);
  return (
    <ul className="flex flex-col gap-4">
      {bookings.map((booking) => {
        const balance = Math.max(booking.total - booking.amountPaid, 0);
        return (
          <li key={booking.code} className="rounded-lg border border-border bg-card p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-small text-muted-foreground">{booking.code}</p>
                <h3 className="font-serif text-h3 font-semibold">
                  <Link href={{ pathname: "/account/bookings/[code]", params: { code: booking.code } }} className="underline-offset-4 hover:underline">
                    {booking.tourTitle ?? booking.tourCode ?? booking.code}
                    <span className="sr-only"> ({t("open", { code: booking.code })})</span>
                  </Link>
                </h3>
                <p className="text-small">
                  {booking.endDate ? formatDateRange(booking.startDate, booking.endDate, locale) : formatDate(booking.startDate, locale)} ·{" "}
                  {t("travellers", { count: booking.travellers })}
                </p>
              </div>
              <div className="flex flex-col gap-2 md:items-end">
                <StatusBadge kind="booking" status={booking.status} label={tCheckout(`statuses.${booking.status}`)} />
                <p className="text-small">
                  {t("total")}: {formatVnd(booking.total, locale)}
                </p>
                {booking.status === "confirmed" && balance > 0 && booking.balanceDueDate ? (
                  <p className="text-small text-warning">{t("balanceDue", { amount: formatVnd(balance, locale), date: formatDate(booking.balanceDueDate, locale) })}</p>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
