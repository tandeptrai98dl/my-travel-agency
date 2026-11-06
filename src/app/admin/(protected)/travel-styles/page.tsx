import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { LocaleBadges } from "@/components/admin/taxonomy/locale-badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { rolesFor } from "@/lib/auth/permissions";
import { getLocaleBadgeLabels } from "@/modules/catalog/taxonomy/taxonomy-labels";
import { listTravelStyles } from "@/modules/catalog/taxonomy/taxonomy.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Phong cách du lịch" };

/** Travel styles (spec Phase 2 step 9). */
export default async function TravelStylesPage() {
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("travelStyles")}
        description={t("travelStylesDescription")}
        actions={
          <Button asChild>
            <Link href="/admin/travel-styles/new">
              <Plus strokeWidth={1.5} aria-hidden="true" />
              {t("newStyle")}
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
        <TravelStyleList />
      </Suspense>
    </div>
  );
}

async function TravelStyleList() {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  const [styles, badgeLabels] = await Promise.all([listTravelStyles(), getLocaleBadgeLabels()]);
  if (styles.length === 0) return <EmptyState title={t("empty")} />;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
      {styles.map((style) => (
        <li key={style.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3" data-testid="travel-style-row">
          <div className="flex min-w-48 flex-1 flex-col">
            <Link
              href={`/admin/travel-styles/${style.id}`}
              className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {style.name}
            </Link>
            <span className="text-small text-muted-foreground">
              <code>{style.key}</code> · {t("sortOrder")} {style.sortOrder}
            </span>
          </div>
          <StatusBadge kind="publish" status={style.status} label={t(`statuses.${style.status}`)} />
          <LocaleBadges locales={style.locales} labels={badgeLabels} />
        </li>
      ))}
    </ul>
  );
}
