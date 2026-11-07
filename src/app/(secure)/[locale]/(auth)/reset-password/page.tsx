import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AuthForm } from "@/components/account/auth-form";
import { AuthShell } from "@/components/account/auth-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { completePasswordResetAction } from "@/modules/identity/customer-auth.actions";
import { hasRecoverySession } from "@/modules/identity/customer-auth.service";

import { authLabels } from "../labels";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Auth.reset" });
  return { title: t("metaTitle") };
}

/**
 * New password after a recovery link (decision 1): only a session marked by `/auth/confirm` for
 * that link opens the form; other sessions are signed out after the change.
 */
export default async function ResetPasswordPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-20 h-80 w-full max-w-[30rem]" aria-hidden="true" />}>
      <Reset locale={locale} />
    </Suspense>
  );
}

async function Reset({ locale }: { locale: Locale }) {
  const [t, tAuth, recovery] = await Promise.all([
    getTranslations({ locale, namespace: "Auth.reset" }),
    getTranslations({ locale, namespace: "Auth" }),
    hasRecoverySession(),
  ]);
  if (!recovery) {
    return (
      <AuthShell eyebrow={tAuth("eyebrow")} title={t("expiredTitle")} intro={t("expired")}>
        <Link href="/forgot-password" className="underline decoration-gold underline-offset-4">
          {t("requestNew")}
        </Link>
      </AuthShell>
    );
  }
  const labels = await authLabels(locale, t("submit"), t("pending"));
  return (
    <AuthShell eyebrow={tAuth("eyebrow")} title={t("title")} intro={t("intro")}>
      <AuthForm
        action={completePasswordResetAction}
        locale={locale}
        labels={labels}
        doneOn={[]}
        testId="reset-form"
        fields={[
          { name: "password", type: "password", label: tAuth("fields.newPassword"), autoComplete: "new-password", required: true, hint: tAuth("fields.passwordHint") },
          { name: "confirm", type: "password", label: tAuth("fields.confirm"), autoComplete: "new-password", required: true },
        ]}
      />
    </AuthShell>
  );
}
