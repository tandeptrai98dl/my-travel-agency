import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { BookingSummaryCard } from "@/components/booking/booking-summary-card";
import { ResultStatus } from "@/components/booking/result-status";
import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading } from "@/components/typography/heading";
import { Skeleton } from "@/components/ui/skeleton";
import { getPathname } from "@/i18n/navigation";
import { analyticsTransactionId } from "@/lib/analytics-transaction";
import { isLocale, type Locale } from "@/i18n/routing";
import { loadCheckout } from "@/modules/booking/checkout.service";

import { BookingMessages } from "../../../messages";

type Props = { params: Promise<{ locale: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Checkout" });
  return { title: t("resultTitle") };
}

/** Where VNPay's return and "I have made the transfer" land: display only, polling (decision 6). */
export default async function ResultPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Container className="flex max-w-4xl flex-col gap-8 py-12 md:py-16">
      <Suspense fallback={<Skeleton className="h-96 w-full" aria-hidden="true" />}>
        <Result params={params} />
      </Suspense>
    </Container>
  );
}

async function Result({ params }: Props) {
  const { locale, code: raw } = (await params) as { locale: Locale; code: string };
  const view = await loadCheckout(decodeURIComponent(raw));
  if (!view) notFound();
  const t = await getTranslations({ locale, namespace: "Checkout" });
  return (
    <BookingMessages locale={locale}>
      <div className="flex flex-col gap-3">
        <Eyebrow>{t("eyebrow", { code: view.code })}</Eyebrow>
        <Heading level={1} size="h1">
          {t("resultTitle")}
        </Heading>
      </div>
      <ResultStatus
        code={view.code}
        initial={{ status: view.status, paymentState: view.paymentState }}
        email={view.contactEmail}
        payHref={getPathname({ locale, href: { pathname: "/checkout/[code]/payment", params: { code: view.code } } })}
        // GA4 `purchase` (Phase 6 spec decision 7, the agreed Stream B line): a salted hash of the
        // code, never the code; sent once per booking, only after consent.
        purchase={{ transactionId: analyticsTransactionId(view.code), value: view.total, tour: { code: view.tourCode, title: view.tourTitle } }}
      />
      <BookingSummaryCard view={view} />
    </BookingMessages>
  );
}
