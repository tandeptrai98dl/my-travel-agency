import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AccountFrame } from "@/components/account/account-frame";
import { AuthForm } from "@/components/account/auth-form";
import { MarketingForm, ProfileForm } from "@/components/account/profile-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { getPathname } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { deleteAccountAction } from "@/modules/account/account-deletion.actions";
import { getMyProfile, requireCustomer } from "@/modules/account/account.service";
import { changeEmailAction, changePasswordAction } from "@/modules/identity/customer-auth.actions";

import { authLabels } from "../../(auth)/labels";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Account.profile" });
  return { title: t("metaTitle") };
}

/** Profile, marketing choice, email and password (decision 4). */
export default async function AccountProfilePage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-[40rem] w-full max-w-7xl" aria-hidden="true" />}>
      <Profile locale={locale} />
    </Suspense>
  );
}

async function Profile({ locale }: { locale: Locale }) {
  const user = await requireCustomer(locale, getPathname({ locale, href: "/account/profile" }));
  const [t, tAuth, profile] = await Promise.all([
    getTranslations({ locale, namespace: "Account.profile" }),
    getTranslations({ locale, namespace: "Auth" }),
    getMyProfile(user.id),
  ]);
  if (!profile) notFound();
  const statusKeys = ["saved", "invalid", "unavailable", "expired", "failed"] as const;
  const errorKeys = ["required", "tooLong", "invalidPhone", "invalid"] as const;
  const messages = {
    status: { ...Object.fromEntries(statusKeys.map((key) => [key, t(`status.${key}`)])), failed: t("status.failed") },
    errors: { ...Object.fromEntries(errorKeys.map((key) => [key, t(`errors.${key}`)])), invalid: t("errors.invalid") },
  };
  const [emailLabels, passwordLabels, deletionLabels] = await Promise.all([
    authLabels(locale, t("emailSubmit"), t("pending")),
    authLabels(locale, t("passwordSubmit"), t("pending")),
    authLabels(locale, t("deletionSubmit"), t("pending"), {
      status: { deletion_pending: t("deletionPending") },
    }),
  ]);
  const sectionClass = "flex flex-col gap-5 rounded-lg border border-border bg-card p-6 md:p-8";

  return (
    <AccountFrame locale={locale} current="profile" title={t("title")}>
      <section aria-labelledby="details-heading" className={sectionClass}>
        <h2 id="details-heading" className="font-serif text-h3 font-semibold">
          {t("details")}
        </h2>
        <ProfileForm
          initial={{ fullName: profile.fullName, phone: profile.phone ?? "", country: profile.country ?? "", locale: profile.locale }}
          labels={{
            ...messages,
            fullName: t("fullName"),
            phone: t("phone"),
            country: t("country"),
            language: t("language"),
            languages: { vi: t("languages.vi"), en: t("languages.en") },
            save: t("save"),
            saving: t("saving"),
          }}
        />
      </section>

      <section aria-labelledby="marketing-heading" className={sectionClass}>
        <h2 id="marketing-heading" className="font-serif text-h3 font-semibold">
          {t("marketingTitle")}
        </h2>
        <MarketingForm locale={locale} initial={profile.marketing} labels={{ ...messages, marketing: t("marketing"), save: t("marketingSave"), saving: t("saving") }} />
      </section>

      <section aria-labelledby="email-heading" className={sectionClass}>
        <h2 id="email-heading" className="font-serif text-h3 font-semibold">
          {t("emailTitle")}
        </h2>
        <p className="text-body">{t("emailCurrent", { email: profile.email })}</p>
        <p className="text-small text-muted-foreground">{t("emailIntro")}</p>
        <AuthForm
          action={changeEmailAction}
          locale={locale}
          labels={emailLabels}
          doneOn={[]}
          resetOn={["sent"]}
          testId="email-form"
          fields={[
            { name: "email", type: "email", label: tAuth("fields.newEmail"), autoComplete: "email", required: true },
            { name: "current", type: "password", label: tAuth("fields.current"), autoComplete: "current-password", required: true },
          ]}
        />
      </section>

      <section aria-labelledby="password-heading" className={sectionClass}>
        <h2 id="password-heading" className="font-serif text-h3 font-semibold">
          {t("passwordTitle")}
        </h2>
        <p className="text-small text-muted-foreground">{t("passwordIntro")}</p>
        <AuthForm
          action={changePasswordAction}
          locale={locale}
          labels={passwordLabels}
          doneOn={[]}
          resetOn={["saved"]}
          testId="password-form"
          fields={[
            { name: "current", type: "password", label: tAuth("fields.current"), autoComplete: "current-password", required: true },
            { name: "password", type: "password", label: tAuth("fields.newPassword"), autoComplete: "new-password", required: true, hint: tAuth("fields.passwordHint") },
            { name: "confirm", type: "password", label: tAuth("fields.confirm"), autoComplete: "new-password", required: true },
          ]}
        />
      </section>

      <section aria-labelledby="deletion-heading" className={sectionClass}>
        <h2 id="deletion-heading" className="font-serif text-h3 font-semibold">
          {t("deletionTitle")}
        </h2>
        <p className="text-small text-muted-foreground">{t("deletionIntro")}</p>
        <AuthForm
          action={deleteAccountAction}
          locale={locale}
          labels={deletionLabels}
          doneOn={["deletion_pending"]}
          resetOn={["invalid"]}
          testId="deletion-form"
          fields={[{ name: "current", type: "password", label: tAuth("fields.current"), autoComplete: "current-password", required: true }]}
        />
      </section>
    </AccountFrame>
  );
}
