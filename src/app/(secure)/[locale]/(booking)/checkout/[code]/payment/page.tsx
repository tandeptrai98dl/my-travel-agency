import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { BookingSummaryCard } from "@/components/booking/booking-summary-card";
import { HoldCountdown } from "@/components/booking/hold-countdown";
import { PaymentMethodForm } from "@/components/booking/payment-method-form";
import { VietQrPanel } from "@/components/booking/vietqr-panel";
import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading } from "@/components/typography/heading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { formatVnd } from "@/lib/money";
import { checkoutMethods, loadCheckout, openTransfer } from "@/modules/booking/checkout.service";

import { BookingMessages } from "../../../messages";

type Props = { params: Promise<{ locale: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Checkout" });
  return { title: t("payTitle") + " · " + decodeURIComponent(code) };
}

/** Method choice, hold countdown and transfer instructions (step 8). */
export default async function PaymentPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Container className="flex max-w-4xl flex-col gap-8 py-12 md:py-16">
      <Suspense fallback={<Skeleton className="h-96 w-full" aria-hidden="true" />}>
        <Payment params={params} />
      </Suspense>
    </Container>
  );
}

async function Payment({ params }: Props) {
  const { locale, code: raw } = (await params) as { locale: Locale; code: string };
  const view = await loadCheckout(decodeURIComponent(raw));
  if (!view) notFound();
  const t = await getTranslations({ locale, namespace: "Checkout" });
  const [methods, transfer] = await Promise.all([checkoutMethods(), openTransfer(view)]);
  const tourHref = { pathname: "/tours" } as const;
  const due = view.dueNow && view.dueNow.amount > 0 ? view.dueNow : null;

  return (
    <BookingMessages locale={locale}>
      <div className="flex flex-col gap-3">
        <Eyebrow>{t("eyebrow", { code: view.code })}</Eyebrow>
        <Heading level={1} size="h1">
          {t("payTitle")}
        </Heading>
        {due && <p className="max-w-[680px] text-body-lg text-muted-foreground">{t("payIntro")}</p>}
      </div>

      {view.status === "expired" ? (
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6" role="status">
          <h2 className="font-serif text-h3 font-semibold">{t("holdExpired")}</h2>
          <div>
            <Button asChild>
              <Link href={tourHref.pathname}>{t("chooseAgain")}</Link>
            </Button>
          </div>
        </section>
      ) : view.status === "confirmed" && !due ? (
        <section className="rounded-lg border border-border bg-card p-6" role="status">
          <h2 className="font-serif text-h3 font-semibold">{t("confirmed")}</h2>
        </section>
      ) : (
        <>
          {view.status === "pending_payment" && view.holdExpiresAt && <HoldCountdown expiresAt={view.holdExpiresAt} />}
          {transfer?.instructions?.kind === "transfer" && (
            <>
              <VietQrPanel transfer={transfer.instructions} locale={locale} />
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href={{ pathname: "/checkout/[code]/result", params: { code: view.code } }}>{t("transferDone")}</Link>
                </Button>
              </div>
            </>
          )}
          {due && methods.length > 0 && (
            <section aria-labelledby="pay-methods" className="flex flex-col gap-4">
              <h2 id="pay-methods" className="sr-only">
                {t("methods")}
              </h2>
              <PaymentMethodForm
                code={view.code}
                methods={methods}
                submitLabel={transfer ? t("switchMethod") : t("pay", { amount: formatVnd(due.amount, locale) })}
              />
            </section>
          )}
          {due && methods.length === 0 && <p className="rounded-lg border border-border bg-card p-6 text-body">{t("noMethods")}</p>}
        </>
      )}
      <BookingSummaryCard view={view} />
    </BookingMessages>
  );
}
