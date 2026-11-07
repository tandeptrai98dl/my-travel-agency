import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { BookingSummaryCard } from "@/components/booking/booking-summary-card";
import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading } from "@/components/typography/heading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { formatVnd } from "@/lib/money";
import { loadCheckout } from "@/modules/booking/checkout.service";

type Props = { params: Promise<{ locale: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Checkout" });
  return { title: t("metaTitle", { code: decodeURIComponent(code) }) };
}

/** Booking summary (step 8): needs the access cookie or the owning customer (decision 7). */
export default async function CheckoutPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Container className="flex max-w-4xl flex-col gap-8 py-12 md:py-16">
      <Suspense fallback={<Skeleton className="h-96 w-full" aria-hidden="true" />}>
        <Summary params={params} />
      </Suspense>
    </Container>
  );
}

async function Summary({ params }: Props) {
  const { locale, code: raw } = (await params) as { locale: Locale; code: string };
  const code = decodeURIComponent(raw);
  const view = await loadCheckout(code);
  if (!view) notFound();
  const t = await getTranslations({ locale, namespace: "Checkout" });
  return (
    <>
      <div className="flex flex-col gap-3">
        <Eyebrow>{t("eyebrow", { code: view.code })}</Eyebrow>
        <Heading level={1} size="h1">
          {t("title")}
        </Heading>
      </div>
      <BookingSummaryCard view={view} />
      {view.dueNow && view.dueNow.amount > 0 && view.status !== "expired" && (
        <div>
          <Button asChild size="lg">
            <Link href={{ pathname: "/checkout/[code]/payment", params: { code: view.code } }}>
              {t("pay", { amount: formatVnd(view.dueNow.amount, locale) })}
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}
