import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AuthForm } from "@/components/account/auth-form";
import { AuthShell } from "@/components/account/auth-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { authTurnstileSiteKey } from "@/modules/identity/auth-guards";
import { resendConfirmationAction, signUpAction } from "@/modules/identity/customer-auth.actions";
import { landingFor, signUpAvailability, verifiedUser } from "@/modules/identity/customer-auth.service";

import { authLabels } from "../labels";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Auth.register" });
  return { title: t("metaTitle") };
}

/**
 * Customer sign-up (decision 1): privacy consent with the published version, marketing optional,
 * Turnstile, always the same "check your email" answer. Off while the privacy policy is
 * unpublished in this language or GoTrue auto-confirms emails (decision 6).
 */
export default async function RegisterPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-20 h-[36rem] w-full max-w-[30rem]" aria-hidden="true" />}>
      <Register locale={locale} />
    </Suspense>
  );
}

async function Register({ locale }: { locale: Locale }) {
  const user = await verifiedUser();
  if (user) redirect(landingFor(user.role, locale));
  const [t, tAuth, availability] = await Promise.all([
    getTranslations({ locale, namespace: "Auth.register" }),
    getTranslations({ locale, namespace: "Auth" }),
    signUpAvailability(locale),
  ]);
  const siteKey = authTurnstileSiteKey();
  const labels = await authLabels(locale, t("submit"), t("pending"), { status: { sent: t("sent") }, unavailable: t("unavailable") });
  const resendLabels = await authLabels(locale, t("resendSubmit"), t("pending"), { status: { sent: t("sent") } });

  return (
    <AuthShell
      eyebrow={tAuth("eyebrow")}
      title={t("title")}
      intro={t("intro")}
      footer={
        <p>
          {t("haveAccount")}{" "}
          <Link href="/login" className="underline decoration-gold underline-offset-4">
            {t("signIn")}
          </Link>
        </p>
      }
    >
      <div className="flex flex-col gap-8">
        <AuthForm
          action={signUpAction}
          locale={locale}
          labels={labels}
          disabled={!availability.enabled}
          turnstile={{ siteKey, action: "signup" }}
          testId="register-form"
          fields={[
            { name: "fullName", type: "text", label: tAuth("fields.fullName"), autoComplete: "name", required: true },
            { name: "email", type: "email", label: tAuth("fields.email"), autoComplete: "email", required: true },
            { name: "password", type: "password", label: tAuth("fields.password"), autoComplete: "new-password", required: true, hint: tAuth("fields.passwordHint") },
            {
              name: "privacy",
              type: "checkbox",
              label: t("privacy"),
              required: true,
              link: availability.privacy ? { href: availability.privacy.href, label: t("privacyLink"), newTab: tAuth("newTab") } : undefined,
            },
            { name: "marketing", type: "checkbox", label: t("marketing") },
          ]}
        />
        {availability.enabled ? (
          <details className="border-t border-border pt-6">
            <summary className="cursor-pointer text-small font-medium">{t("resendTitle")}</summary>
            <div className="pt-4">
              <AuthForm
                action={resendConfirmationAction}
                locale={locale}
                labels={resendLabels}
                turnstile={{ siteKey, action: "resend" }}
                fields={[{ name: "email", type: "email", label: tAuth("fields.email"), autoComplete: "email", required: true }]}
              />
            </div>
          </details>
        ) : null}
      </div>
    </AuthShell>
  );
}
