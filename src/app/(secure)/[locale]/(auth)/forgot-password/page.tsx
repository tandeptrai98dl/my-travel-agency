import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AuthForm } from "@/components/account/auth-form";
import { AuthShell } from "@/components/account/auth-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { authTurnstileSiteKey, turnstileUsable } from "@/modules/identity/auth-guards";
import { requestPasswordResetAction } from "@/modules/identity/customer-auth.actions";

import { authLabels } from "../labels";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Auth.forgot" });
  return { title: t("metaTitle") };
}

/** Password reset request (decision 1): Turnstile, limits, always the same answer. */
export default async function ForgotPasswordPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-20 h-80 w-full max-w-[30rem]" aria-hidden="true" />}>
      <Forgot locale={locale} />
    </Suspense>
  );
}

async function Forgot({ locale }: { locale: Locale }) {
  const [t, tAuth] = await Promise.all([getTranslations({ locale, namespace: "Auth.forgot" }), getTranslations({ locale, namespace: "Auth" })]);
  const labels = await authLabels(locale, t("submit"), t("pending"), { status: { sent: t("sent") }, unavailable: tAuth("status.unavailable") });
  return (
    <AuthShell
      eyebrow={tAuth("eyebrow")}
      title={t("title")}
      intro={t("intro")}
      footer={
        <Link href="/login" className="underline decoration-gold underline-offset-4">
          {t("back")}
        </Link>
      }
    >
      <AuthForm
        action={requestPasswordResetAction}
        locale={locale}
        labels={labels}
        disabled={!turnstileUsable()}
        turnstile={{ siteKey: authTurnstileSiteKey(), action: "reset" }}
        testId="forgot-form"
        fields={[{ name: "email", type: "email", label: tAuth("fields.email"), autoComplete: "email", required: true }]}
      />
    </AuthShell>
  );
}
