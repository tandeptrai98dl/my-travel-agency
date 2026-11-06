import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { STAFF_ROLES } from "@/lib/auth/permissions";

import { requireAdminAccess } from "../admin-gate";

export const metadata: Metadata = { title: "Tổng quan" };

/** Role-aware landing page; the dashboard metrics come in Phases 4–5. */
export default async function AdminHomePage() {
  const user = await requireAdminAccess(STAFF_ROLES);
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader title={t("Nav.dashboard")} description={t("placeholder")} />
      <dl className="grid gap-4 text-small sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-muted-foreground">{t("Shell.account")}</dt>
          <dd className="mt-1 break-all font-medium">{t("signedInAs", { email: user.email })}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="sr-only">{t("roleLabel")}</dt>
          <dd data-testid="admin-role" className="font-medium">
            {t("role", { role: t(`roles.${user.role}`) })}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="sr-only">{t("mfaLabel")}</dt>
          <dd data-testid="admin-aal" className="font-medium">
            {t("mfaStatus", { status: user.aal === "aal2" ? t("mfaOn") : t("mfaOff") })}
          </dd>
          <Link href="/admin/mfa" className="mt-2 inline-block text-small underline underline-offset-4">
            {t("manageMfa")}
          </Link>
        </div>
      </dl>
    </div>
  );
}
