import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AccountFrame } from "@/components/account/account-frame";
import { BookingList } from "@/components/account/booking-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getPathname } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { listMyBookings, requireCustomer } from "@/modules/account/account.service";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Account.overview" });
  return { title: t("metaTitle") };
}

/** Account overview (docs/specs/phase-5-accounts-inquiries-operations.md decision 4). */
export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-96 w-full max-w-7xl" aria-hidden="true" />}>
      <Overview locale={locale} />
    </Suspense>
  );
}

async function Overview({ locale }: { locale: Locale }) {
  const user = await requireCustomer(locale, getPathname({ locale, href: "/account" }));
  const [t, bookings] = await Promise.all([getTranslations({ locale, namespace: "Account.overview" }), listMyBookings()]);
  const upcoming = bookings.filter((booking) => booking.upcoming).reverse();
  return (
    <AccountFrame locale={locale} current="overview" title={user.fullName ? t("greeting", { name: user.fullName }) : t("greetingNoName")}>
      <p className="max-w-prose text-body-lg text-muted-foreground">{t("intro", { email: user.email })}</p>
      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-5">
        <h2 id="upcoming-heading" className="font-serif text-h2 font-medium">
          {t("upcoming")}
        </h2>
        {upcoming.length > 0 ? (
          <BookingList locale={locale} bookings={upcoming} />
        ) : (
          <p className="text-body text-muted-foreground">
            {t("noUpcoming")}{" "}
            <Link href="/tours" className="text-foreground underline decoration-gold underline-offset-4">
              {t("explore")}
            </Link>
          </p>
        )}
        <Link href="/account/bookings" className="self-start text-small underline decoration-gold underline-offset-4">
          {t("allBookings")}
        </Link>
      </section>
    </AccountFrame>
  );
}
