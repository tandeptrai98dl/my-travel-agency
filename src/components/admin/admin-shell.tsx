import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/toaster";
import type { CurrentUser } from "@/lib/auth/get-user";
import { can } from "@/lib/auth/permissions";
import { signOut } from "@/modules/identity/identity.actions";

import { AdminMobileNav, AdminSidebar, type VisibleNavGroup } from "./admin-nav";
import { ADMIN_NAV } from "./nav-items";
import { SignOutButton } from "./sign-out-button";

type Props = { user: CurrentUser; showDevItems: boolean; children: React.ReactNode };

/**
 * Admin frame: role-based sidebar, top bar with the signed-in user and the page in `<main>`.
 * The menu only hides what a role cannot use; every page and action checks again on the server.
 */
export async function AdminShell({ user, showDevItems, children }: Props) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });

  const groups: VisibleNavGroup[] = ADMIN_NAV.map((group) => ({
    label: t(`Nav.${group.labelKey}`),
    items: group.items
      .filter((item) => can(user.role, item.permission) && (!item.devOnly || showDevItems))
      .map((item) => ({ href: item.href, label: t(`Nav.${item.labelKey}`), icon: item.icon })),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#admin-main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("Shell.skipToContent")}
      </a>
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-4 md:px-6">
        <div className="flex items-center gap-2">
          <AdminMobileNav
            groups={groups}
            labels={{ nav: t("Nav.label"), openMenu: t("Nav.openMenu"), closeMenu: t("Nav.closeMenu") }}
          />
          <Link href="/admin" className="font-serif text-h4 font-semibold">
            {t("title")}
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="hidden items-center gap-1 text-small text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            {t("Nav.site")}
            <ExternalLink className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </Link>
          <div className="hidden flex-col items-end text-small leading-tight md:flex">
            <span className="font-medium">{user.fullName ?? user.email}</span>
            <span className="text-muted-foreground">{t(`roles.${user.role}`)}</span>
          </div>
          <Badge variant={user.aal === "aal2" ? "success" : "outline"} className="hidden sm:inline-flex">
            {user.aal === "aal2" ? t("Shell.mfaVerified") : t("Shell.mfaNotVerified")}
          </Badge>
          <SignOutButton label={t("signOut")} action={signOut} variant="outline" size="sm" />
        </div>
      </header>
      <div className="flex flex-1">
        <AdminSidebar groups={groups} label={t("Nav.label")} />
        <main id="admin-main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {children}
        </main>
      </div>
      <Toaster
        closeLabel={t("Shell.close")}
        toastLabel={t("Shell.notification")}
        // Radix fills in the hotkey; keep the placeholder literal.
        regionLabel={t("Shell.notifications", { hotkey: "{hotkey}" })}
      />
    </div>
  );
}
