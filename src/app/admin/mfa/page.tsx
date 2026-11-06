import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { MfaSetup, type MfaSetupMessages } from "@/components/admin/mfa-setup";
import { getAuthState } from "@/lib/auth/get-user";
import { isStaffRole, requiresMfa } from "@/lib/auth/permissions";
import { startTotpEnrolment, verifyTotpCode } from "@/modules/identity/identity.actions";

export const metadata: Metadata = { title: "Xác thực hai lớp" };

async function MfaContent() {
  // Open to every staff member at any assurance level (this is where aal2 is reached), so it
  // cannot use the gate that redirects here.
  const state = await getAuthState();
  if (state.status === "signed_out") redirect("/auth/login");
  if (state.status === "inactive" || !isStaffRole(state.user.role)) notFound();
  const { user } = state;

  const t = await getTranslations({ locale: "vi", namespace: "Admin.Mfa" });
  const messages: MfaSetupMessages = {
    enrolIntro: t("enrolIntro"),
    secretLabel: t("secretLabel"),
    verifyIntro: t("verifyIntro"),
    codeLabel: t("codeLabel"),
    start: t("start"),
    verify: t("verify"),
    verifying: t("verifying"),
    invalidCode: t("invalidCode"),
    genericError: t("genericError"),
    done: t("done"),
    continue: t("continue"),
    qrAlt: t("qrAlt"),
  };

  const mode = user.aal === "aal2" ? "done" : user.hasVerifiedFactor ? "verify" : "enrol";

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-medium">{t("title")}</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        {requiresMfa(user.role) ? t("requiredNotice") : t("optionalNotice")}
      </p>
      <MfaSetup
        className="mt-8"
        initialMode={mode}
        messages={messages}
        actions={{ start: startTotpEnrolment, verify: verifyTotpCode }}
      />
    </main>
  );
}

export default function AdminMfaPage() {
  return (
    <Suspense fallback={null}>
      <MfaContent />
    </Suspense>
  );
}
