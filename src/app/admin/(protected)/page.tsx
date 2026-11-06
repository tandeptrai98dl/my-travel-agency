import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ADMIN_NAV } from "@/components/admin/nav-items";
import { PageHeader } from "@/components/admin/page-header";
import { can, STAFF_ROLES } from "@/lib/auth/permissions";
import { designSystemEnabled } from "@/lib/env/flags";

import { requireAdminAccess } from "../admin-gate";

export const metadata: Metadata = { title: "Tổng quan" };

/**
 * Role-aware landing page (spec Phase 2 step 23): shortcuts to every section the role can use,
 * from the same permission matrix as the menu. The dashboard figures come in Phases 4–5.
 */
export default async function AdminHomePage() {
  const user = await requireAdminAccess(STAFF_ROLES);
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const showDevItems = designSystemEnabled();
  const groups = ADMIN_NAV.map((group) => ({
    label: t(`Nav.${group.labelKey}`),
    items: group.items.filter(
      (item) => item.href !== "/admin" && can(user.role, item.permission) && (!item.devOnly || showDevItems),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 md:px-8">
      <PageHeader title={t("Nav.dashboard")} description={t("Dashboard.description")} />
      <section aria-labelledby="dashboard-account-title" className="flex flex-col gap-4">
        <h2 id="dashboard-account-title" className="sr-only">
          {t("Dashboard.account")}
        </h2>
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
            <dd>
              <Link href="/admin/mfa" className="mt-2 inline-block py-1 text-small underline underline-offset-4">
                {t("manageMfa")}
              </Link>
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="dashboard-shortcuts-title" className="flex flex-col gap-6">
        <h2 id="dashboard-shortcuts-title" className="font-serif text-h3 font-semibold lg:text-h3-lg">
          {t("Dashboard.sectionsTitle")}
        </h2>
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-3">
            <h3 className="text-eyebrow font-semibold uppercase text-muted-foreground">{group.label}</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex h-full flex-col gap-1 rounded-lg border border-border bg-card p-4 transition-colors duration-200 hover:border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="flex items-center justify-between gap-2 font-medium">
                      {t(`Nav.${item.labelKey}`)}
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                    </span>
                    <span className="text-small text-muted-foreground">{t(`Dashboard.links.${item.labelKey}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
