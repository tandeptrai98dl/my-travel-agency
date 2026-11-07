import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { authLabels } from "@/app/(secure)/[locale]/(auth)/labels";
import { AuthForm } from "@/components/account/auth-form";
import { Skeleton } from "@/components/ui/skeleton";
import { completePasswordResetAction } from "@/modules/identity/customer-auth.actions";
import { hasRecoverySession } from "@/modules/identity/customer-auth.service";

import { StaffCard } from "../staff-card";

export const metadata: Metadata = { title: "Đặt mật khẩu" };

/**
 * Staff set-password page (invitations, ADR-032, and recovery links): only a session marked by
 * `/auth/confirm` for such a link opens the form (decision 1).
 */
export default function StaffUpdatePasswordPage() {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full" aria-hidden="true" />}>
      <UpdatePassword />
    </Suspense>
  );
}

async function UpdatePassword() {
  const [t, tAuth, recovery] = await Promise.all([
    getTranslations({ locale: "vi", namespace: "StaffAuth" }),
    getTranslations({ locale: "vi", namespace: "Auth" }),
    hasRecoverySession(),
  ]);
  if (!recovery) {
    return (
      <StaffCard title={tAuth("reset.expiredTitle")} intro={tAuth("reset.expired")}>
        <Link href="/auth/forgot-password" className="self-start text-small underline decoration-gold underline-offset-4">
          {tAuth("reset.requestNew")}
        </Link>
      </StaffCard>
    );
  }
  const labels = await authLabels("vi", tAuth("reset.submit"), tAuth("reset.pending"));
  return (
    <StaffCard title={t("updateTitle")} intro={t("updateIntro")}>
      <AuthForm
        action={completePasswordResetAction}
        locale="vi"
        labels={labels}
        doneOn={[]}
        fields={[
          { name: "password", type: "password", label: tAuth("fields.newPassword"), autoComplete: "new-password", required: true, hint: tAuth("fields.passwordHint") },
          { name: "confirm", type: "password", label: tAuth("fields.confirm"), autoComplete: "new-password", required: true },
        ]}
      />
    </StaffCard>
  );
}
