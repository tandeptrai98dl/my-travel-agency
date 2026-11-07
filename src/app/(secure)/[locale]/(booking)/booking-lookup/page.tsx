import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AuthForm } from "@/components/account/auth-form";
import { AuthShell } from "@/components/account/auth-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { bookingLookupAction } from "@/modules/booking/booking-lookup.actions";
import { bookingLookupAvailable } from "@/modules/booking/booking-lookup.service";
import { authTurnstileSiteKey } from "@/modules/identity/auth-guards";

import { authLabels } from "../../(auth)/labels";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Lookup" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Guest booking lookup (spec Phase 5 decision 7): code and email, Turnstile and limits, always the
 * same answer; the single-use link is emailed after the response and opens the checkout summary
 * with a button (the emailed-link flow of ADR-038).
 */
export default async function BookingLookupPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-20 h-80 w-full max-w-[30rem]" aria-hidden="true" />}>
      <Lookup locale={locale} />
    </Suspense>
  );
}

async function Lookup({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "Lookup" });
  const base = await authLabels(locale, t("submit"), t("pending"), { status: { sent: t("sent") }, unavailable: t("unavailable") });
  const labels = { ...base, errors: { ...base.errors, invalidCode: t("invalidCode") } };
  const available = bookingLookupAvailable();
  return (
    <AuthShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      intro={t("intro")}
      footer={
        <Link href="/login" className="underline decoration-gold underline-offset-4">
          {t("account")}
        </Link>
      }
    >
      <AuthForm
        action={bookingLookupAction}
        locale={locale}
        labels={labels}
        disabled={!available}
        turnstile={{ siteKey: authTurnstileSiteKey(), action: "lookup" }}
        testId="lookup-form"
        fields={[
          { name: "code", type: "text", label: t("code"), hint: t("codeHint"), autoComplete: "off", required: true },
          { name: "email", type: "email", label: t("email"), autoComplete: "email", required: true },
        ]}
      />
    </AuthShell>
  );
}
