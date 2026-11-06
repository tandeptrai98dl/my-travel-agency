import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/admin/sign-out-button";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { signOut } from "@/modules/identity/identity.actions";

import { requireAdminAccess } from "../admin-gate";

export const metadata: Metadata = { title: "Tổng quan" };

/** Phase 0 placeholder: shows who is signed in. The dashboard comes in Phases 4–5. */
export default async function AdminHomePage() {
  const user = await requireAdminAccess(STAFF_ROLES);
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-medium">{t("title")}</h1>
      <dl className="mt-8 space-y-2 text-sm">
        <div>{t("signedInAs", { email: user.email })}</div>
        <div data-testid="admin-role">{t("role", { role: t(`roles.${user.role}`) })}</div>
        <div data-testid="admin-aal">
          {t("mfaStatus", { status: user.aal === "aal2" ? t("mfaOn") : t("mfaOff") })}
        </div>
      </dl>
      <p className="mt-8 text-muted-foreground">{t("placeholder")}</p>
      <div className="mt-8 flex items-center gap-6">
        <Link href="/admin/mfa" className="text-sm underline underline-offset-4">
          {t("manageMfa")}
        </Link>
        <SignOutButton label={t("signOut")} action={signOut} />
      </div>
    </main>
  );
}
