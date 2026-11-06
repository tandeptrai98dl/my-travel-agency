import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { LocaleBadges } from "@/components/admin/taxonomy/locale-badges";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { rolesFor } from "@/lib/auth/permissions";
import { getLocaleBadgeLabels } from "@/modules/catalog/taxonomy/taxonomy-labels";
import { listPages } from "@/modules/content/content.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Trang tĩnh" };

/** The fixed static pages (spec Phase 2 step 18): about, policies and FAQ. */
export default async function PagesPage() {
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Content" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader title={t("pages")} description={t("pagesDescription")} />
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
        <PageList />
      </Suspense>
    </div>
  );
}

async function PageList() {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const [pages, badgeLabels] = await Promise.all([listPages(), getLocaleBadgeLabels()]);
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card" aria-label={t("Content.pages")}>
      {pages.map((page) => (
        <li key={page.key} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex min-w-48 flex-1 flex-col">
            <Link
              href={`/admin/pages/${page.key}`}
              className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t(`Content.pageKeys.${page.key}`)}
            </Link>
            <span className="text-small text-muted-foreground">{page.title ?? t("Content.pageNotWritten")}</span>
          </div>
          {page.status ? (
            <StatusBadge kind="publish" status={page.status} label={t(`Taxonomy.statuses.${page.status}`)} />
          ) : (
            <Badge variant="outline">{t("Content.notStarted")}</Badge>
          )}
          <LocaleBadges locales={page.locales} labels={badgeLabels} />
        </li>
      ))}
    </ul>
  );
}
