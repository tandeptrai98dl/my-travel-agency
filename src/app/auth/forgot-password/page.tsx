import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { authLabels } from "@/app/(secure)/[locale]/(auth)/labels";
import { AuthForm } from "@/components/account/auth-form";
import { authTurnstileSiteKey, turnstileUsable } from "@/modules/identity/auth-guards";
import { requestPasswordResetAction } from "@/modules/identity/customer-auth.actions";

import { StaffCard } from "../staff-card";

export const metadata: Metadata = { title: "Quên mật khẩu" };

/** Staff password reset request: the same Server Action (Turnstile, limits, one answer). */
export default async function StaffForgotPasswordPage() {
  const [t, tAuth] = await Promise.all([getTranslations({ locale: "vi", namespace: "StaffAuth" }), getTranslations({ locale: "vi", namespace: "Auth" })]);
  const labels = await authLabels("vi", tAuth("forgot.submit"), tAuth("forgot.pending"), { status: { sent: tAuth("forgot.sent") }, unavailable: tAuth("status.unavailable") });
  return (
    <StaffCard title={t("forgotTitle")} intro={tAuth("forgot.intro")}>
      <AuthForm
        action={requestPasswordResetAction}
        locale="vi"
        labels={labels}
        disabled={!turnstileUsable()}
        turnstile={{ siteKey: authTurnstileSiteKey(), action: "reset" }}
        fields={[{ name: "email", type: "email", label: tAuth("fields.email"), autoComplete: "email", required: true }]}
      />
      <Link href="/auth/login" className="self-start text-small underline decoration-gold underline-offset-4">
        {t("back")}
      </Link>
    </StaffCard>
  );
}
