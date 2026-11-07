import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AuthForm } from "@/components/account/auth-form";
import { AuthShell } from "@/components/account/auth-shell";
import { GoogleButton } from "@/components/account/google-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { signInAction } from "@/modules/identity/customer-auth.actions";
import { googleEnabled, landingFor, verifiedUser } from "@/modules/identity/customer-auth.service";

import { authLabels } from "../labels";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Auth.login" });
  return { title: t("metaTitle") };
}

/** Customer sign-in (docs/specs/phase-5-accounts-inquiries-operations.md decision 1). */
export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-20 h-96 w-full max-w-[30rem]" aria-hidden="true" />}>
      <Login locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

async function Login({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  const query = await searchParams;
  const next = first(query.next).slice(0, 500);
  const user = await verifiedUser();
  if (user) redirect(landingFor(user.role, locale, next));

  const [t, tAuth] = await Promise.all([getTranslations({ locale, namespace: "Auth.login" }), getTranslations({ locale, namespace: "Auth" })]);
  const labels = await authLabels(locale, t("submit"), t("pending"));
  const oauthError = first(query.error) === "oauth";

  return (
    <AuthShell
      eyebrow={tAuth("eyebrow")}
      title={t("title")}
      intro={t("intro")}
      footer={
        <>
          <p>
            {t("noAccount")}{" "}
            <Link href="/register" className="underline decoration-gold underline-offset-4">
              {t("register")}
            </Link>
          </p>
          <p className="text-muted-foreground">{t("lookup")}</p>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {oauthError ? (
          <p role="alert" className="text-small text-destructive">
            {t("oauthError")}
          </p>
        ) : null}
        <AuthForm
          action={signInAction}
          locale={locale}
          hidden={{ next, surface: "customer" }}
          labels={labels}
          doneOn={[]}
          testId="login-form"
          fields={[
            { name: "email", type: "email", label: tAuth("fields.email"), autoComplete: "email", required: true },
            { name: "password", type: "password", label: tAuth("fields.password"), autoComplete: "current-password", required: true },
          ]}
        />
        <Link href="/forgot-password" className="self-start text-small underline decoration-gold underline-offset-4">
          {t("forgot")}
        </Link>
        {googleEnabled() ? (
          <>
            <p className="flex items-center gap-3 text-small text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">{t("or")}</p>
            <GoogleButton locale={locale} next={next} label={t("google")} />
          </>
        ) : null}
      </div>
    </AuthShell>
  );
}
