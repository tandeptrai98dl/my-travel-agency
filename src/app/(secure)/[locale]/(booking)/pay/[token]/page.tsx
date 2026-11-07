import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { RedeemLinkButton } from "@/components/booking/redeem-link-button";
import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/typography/eyebrow";
import { Heading } from "@/components/typography/heading";
import { Skeleton } from "@/components/ui/skeleton";
import { isLocale, type Locale } from "@/i18n/routing";
import { bookingEnabled, paymentLinkState } from "@/modules/booking/checkout.service";

type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "PayLink" });
  return { title: t("metaTitle"), referrer: "no-referrer" };
}

/** A sales payment link (spec Phase 4 step 14): `/thanh-toan/link/[token]` (`/en/pay/[token]`). */
export default async function PayLinkPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-16 md:py-24">
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
        <Link params={params} />
      </Suspense>
    </Container>
  );
}

async function Link({ params }: Props) {
  const { locale, token } = (await params) as { locale: Locale; token: string };
  const t = await getTranslations({ locale, namespace: "PayLink" });
  const state = bookingEnabled() ? await paymentLinkState(token) : "unavailable";
  const copy = {
    valid: [t("title"), t("validBody")],
    used: [t("usedTitle"), t("usedBody")],
    expired: [t("expiredTitle"), t("expiredBody")],
    invalid: [t("invalidTitle"), t("invalidBody")],
    unavailable: [t("unavailableTitle"), t("unavailableBody")],
  }[state];
  const messages = await getMessages({ locale });
  return (
    <section className="flex flex-col gap-6" data-testid="pay-link" data-state={state}>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <Heading level={1} size="h1">
        {copy[0]}
      </Heading>
      <div aria-hidden="true" className="h-px w-16 bg-gold" />
      <p className="max-w-[680px] text-body-lg text-muted-foreground">{copy[1]}</p>
      {state === "valid" && (
        <NextIntlClientProvider locale={locale} messages={{ PayLink: messages.PayLink }}>
          <RedeemLinkButton token={token} />
        </NextIntlClientProvider>
      )}
    </section>
  );
}
