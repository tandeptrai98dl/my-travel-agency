import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AccountFrame } from "@/components/account/account-frame";
import { BookingList } from "@/components/account/booking-list";
import { Skeleton } from "@/components/ui/skeleton";
import { getPathname } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { listMyBookings, requireCustomer } from "@/modules/account/account.service";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Account.bookings" });
  return { title: t("metaTitle") };
}

/** All of the customer's bookings, upcoming first (read through `customer_bookings()`). */
export default async function AccountBookingsPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-96 w-full max-w-7xl" aria-hidden="true" />}>
      <Bookings locale={locale} />
    </Suspense>
  );
}

async function Bookings({ locale }: { locale: Locale }) {
  await requireCustomer(locale, getPathname({ locale, href: "/account/bookings" }));
  const [t, bookings] = await Promise.all([getTranslations({ locale, namespace: "Account.bookings" }), listMyBookings()]);
  const upcoming = bookings.filter((booking) => booking.upcoming).reverse();
  const past = bookings.filter((booking) => !booking.upcoming);
  return (
    <AccountFrame locale={locale} current="bookings" title={t("title")}>
      {bookings.length === 0 ? <p className="max-w-prose text-body text-muted-foreground">{t("empty")}</p> : null}
      {upcoming.length > 0 ? (
        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-5">
          <h2 id="upcoming-heading" className="font-serif text-h2 font-medium">
            {t("upcoming")}
          </h2>
          <BookingList locale={locale} bookings={upcoming} />
        </section>
      ) : null}
      {past.length > 0 ? (
        <section aria-labelledby="past-heading" className="flex flex-col gap-5">
          <h2 id="past-heading" className="font-serif text-h2 font-medium">
            {t("past")}
          </h2>
          <BookingList locale={locale} bookings={past} />
        </section>
      ) : null}
    </AccountFrame>
  );
}
