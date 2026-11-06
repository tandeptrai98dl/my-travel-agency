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
import { type DestinationListItem, listDestinations } from "@/modules/catalog/taxonomy/taxonomy.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Điểm đến" };

/** Destination tree: country → region → city (spec Phase 2 step 8). */
export default async function DestinationsPage() {
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("destinations")}
        description={t("destinationsDescription")}
        actions={
          <Button asChild>
            <Link href="/admin/destinations/new">
              <Plus strokeWidth={1.5} aria-hidden="true" />
              {t("newDestination")}
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
        <DestinationTree />
      </Suspense>
    </div>
  );
}

async function DestinationTree() {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Taxonomy" });
  const [tree, badgeLabels] = await Promise.all([listDestinations(), getLocaleBadgeLabels()]);
  if (tree.length === 0) return <EmptyState title={t("empty")} />;

  return <Rows items={tree} level={0} t={t} badgeLabels={badgeLabels} />;
}

type T = Awaited<ReturnType<typeof getTranslations<"Admin.Taxonomy">>>;
type BadgeLabels = Awaited<ReturnType<typeof getLocaleBadgeLabels>>;

function Rows({
  items,
  level,
  t,
  badgeLabels,
}: {
  items: DestinationListItem[];
  level: number;
  t: T;
  badgeLabels: BadgeLabels;
}) {
  return (
    <ul
      className={
        level === 0 ? "flex flex-col divide-y divide-border rounded-lg border border-border bg-card" : "flex flex-col"
      }
    >
      {items.map((item) => (
        <li key={item.id} data-testid="destination-row">
          <div
            className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3"
            style={{ paddingLeft: `${1 + level * 1.75}rem` }}
          >
            <div className="flex min-w-48 flex-1 flex-col">
              <Link
                href={`/admin/destinations/${item.id}`}
                className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {item.name}
              </Link>
              <span className="text-small text-muted-foreground">
                {t(`types.${item.type}`)} · <code>{item.key}</code>
              </span>
            </div>
            <StatusBadge kind="publish" status={item.status} label={t(`statuses.${item.status}`)} />
            <LocaleBadges locales={item.locales} labels={badgeLabels} />
            {item.type !== "city" && (
              <Link
                href={`/admin/destinations/new?parent=${item.id}`}
                className="text-small font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`${item.type === "country" ? t("newRegion") : t("newCity")}: ${item.name}`}
              >
                {item.type === "country" ? t("newRegion") : t("newCity")}
              </Link>
            )}
          </div>
          {item.children.length > 0 && <Rows items={item.children} level={level + 1} t={t} badgeLabels={badgeLabels} />}
        </li>
      ))}
    </ul>
  );
}
