import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { BookingSummaryCard } from "@/components/booking/booking-summary-card";
import { OpenCheckoutButton } from "@/components/booking/open-checkout-button";
import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading } from "@/components/typography/heading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { formatVnd } from "@/lib/money";
import { emailLinkValid, loadCheckout } from "@/modules/booking/checkout.service";

type Props = {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<{ access?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Checkout" });
  // An emailed link carries an access token in its query: never send it on as a referrer.
  return { title: t("metaTitle", { code: decodeURIComponent(code) }), referrer: "no-referrer" };
}

/**
 * Booking summary (step 8): needs the access cookie, the owning customer, or (4E) a signed link
 * from an email, which only offers an "open" button until the customer clicks it (decision 7).
 */
export default async function CheckoutPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Container className="flex max-w-4xl flex-col gap-8 py-12 md:py-16">
      <Suspense fallback={<Skeleton className="h-96 w-full" aria-hidden="true" />}>
        <Summary params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Summary({ params, searchParams }: Props) {
  const { locale, code: raw } = (await params) as { locale: Locale; code: string };
  const code = decodeURIComponent(raw);
  const view = await loadCheckout(code);
  if (!view) {
    const access = (await searchParams).access;
    const token = typeof access === "string" ? access : undefined;
    if (token && (await emailLinkValid(code, token))) return <OpenFromEmail locale={locale} code={code} token={token} />;
    notFound();
  }
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

async function OpenFromEmail({ locale, code, token }: { locale: Locale; code: string; token: string }) {
  const t = await getTranslations({ locale, namespace: "CheckoutLink" });
  const messages = await getMessages({ locale });
  return (
    <section className="flex flex-col gap-6" data-testid="checkout-email-link">
      <Heading level={1} size="h1">
        {t("title")}
      </Heading>
      <div aria-hidden="true" className="h-px w-16 bg-gold" />
      <p className="max-w-[680px] text-body-lg text-muted-foreground">{t("body", { code })}</p>
      <NextIntlClientProvider locale={locale} messages={{ CheckoutLink: messages.CheckoutLink }}>
        <OpenCheckoutButton code={code} token={token} />
      </NextIntlClientProvider>
    </section>
  );
}
