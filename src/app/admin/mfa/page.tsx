import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { MfaSetup, type MfaSetupMessages } from "@/components/admin/mfa-setup";
import { getCurrentUser } from "@/lib/auth/get-user";
import { isStaffRole, requiresMfa } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Xác thực hai lớp" };

async function MfaContent() {
  // Open to every staff member at any assurance level (this is where aal2 is reached), so it
  // cannot use the gate that redirects here.
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  if (!isStaffRole(user.role)) notFound();

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
      <MfaSetup className="mt-8" initialMode={mode} messages={messages} />
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
