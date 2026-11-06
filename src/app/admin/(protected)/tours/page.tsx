import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { LocaleBadges } from "@/components/admin/taxonomy/locale-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { currentQuery, listHref, parseListParams } from "@/lib/admin/list-params";
import { can, rolesFor } from "@/lib/auth/permissions";
import { getLocaleBadgeLabels } from "@/modules/catalog/taxonomy/taxonomy-labels";
import { TOUR_SORTS, tourListFilters, TOURS_PAGE_SIZE } from "@/modules/catalog/tours/tours.schemas";
import { listTours, type TourListItem } from "@/modules/catalog/tours/tours.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Tour" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/tours";
const DEFAULTS = { sort: "updated_at", dir: "desc" } as const;

/** Tour list (spec Phase 2 step 12): every staff role reads it; editors and admins edit. */
export default async function ToursPage({ searchParams }: Props) {
  const user = await requireAdminAccess(rolesFor("tours.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Tours" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          can(user.role, "tours.edit_content") ? (
            <Button asChild>
              <Link href="/admin/tours/new">
                <Plus strokeWidth={1.5} aria-hidden="true" />
                {t("newTour")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      {/* Reads the URL, so it streams in its own boundary (Cache Components). */}
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
        <TourList searchParams={searchParams} canEdit={can(user.role, "tours.edit_content")} />
      </Suspense>
    </div>
  );
}

async function TourList({ searchParams, canEdit }: Props & { canEdit: boolean }) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const params = parseListParams(await searchParams, {
    sortable: TOUR_SORTS,
    defaultSort: DEFAULTS.sort,
    defaultDir: DEFAULTS.dir,
    pageSize: TOURS_PAGE_SIZE,
    filters: tourListFilters,
  });
  const query = currentQuery(params, DEFAULTS);
  const [{ items, total, pageCount }, badgeLabels] = await Promise.all([listTours(params), getLocaleBadgeLabels()]);

  const columns: DataTableColumn<TourListItem>[] = [
    {
      key: "code",
      header: t("Tours.columns.code"),
      sortKey: "code",
      className: "whitespace-nowrap",
      cell: (row) => <code>{row.code}</code>,
    },
    {
      key: "name",
      header: t("Tours.columns.name"),
      cell: (row) => (
        <div className="flex flex-col gap-1">
          {canEdit ? (
            <Link
              href={`/admin/tours/${row.id}`}
              className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {row.title}
            </Link>
          ) : (
            // Sales, operators and accountants read the catalog; editing is for editors and admins.
            <span className="font-medium">{row.title}</span>
          )}
          <span className="text-small text-muted-foreground">
            {t(`Tours.scopes.${row.scope}`)}
            {row.isFeatured && <> · {t("Tours.featured")}</>}
          </span>
        </div>
      ),
    },
    {
      key: "type",
      header: t("Tours.columns.type"),
      cell: (row) => <Badge variant="outline">{t(`Tours.types.${row.type}`)}</Badge>,
    },
    {
      key: "duration",
      header: t("Tours.columns.duration"),
      sortKey: "duration_days",
      className: "whitespace-nowrap",
      cell: (row) => t("Tours.days", { count: row.durationDays }),
    },
    {
      key: "status",
      header: t("Tours.columns.status"),
      cell: (row) => <StatusBadge kind="publish" status={row.status} label={t(`Tours.statuses.${row.status}`)} />,
    },
    {
      key: "languages",
      header: t("Tours.columns.languages"),
      cell: (row) => <LocaleBadges locales={row.locales} labels={badgeLabels} />,
    },
    {
      key: "next",
      header: t("Tours.columns.next"),
      className: "whitespace-nowrap",
      cell: (row) =>
        row.nextDeparture ? (
          <time dateTime={row.nextDeparture}>
            {format.dateTime(new Date(`${row.nextDeparture}T00:00:00`), { day: "2-digit", month: "2-digit", year: "numeric" })}
          </time>
        ) : (
          <span className="text-muted-foreground">{t("Tours.noDeparture")}</span>
        ),
    },
  ];

  const filtered = Boolean(params.q || Object.keys(params.filters).length);
  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        action={BASE}
        search={{ label: t("Tours.searchLabel"), value: params.q }}
        selects={[
          {
            name: "status",
            label: t("Tours.status"),
            value: params.filters.status,
            allLabel: t("Tours.allStatuses"),
            options: tourListFilters.status.map((value) => ({ value, label: t(`Tours.statuses.${value}`) })),
          },
          {
            name: "type",
            label: t("Tours.type"),
            value: params.filters.type,
            allLabel: t("Tours.allTypes"),
            options: tourListFilters.type.map((value) => ({ value, label: t(`Tours.types.${value}`) })),
          },
          {
            name: "scope",
            label: t("Tours.scope"),
            value: params.filters.scope,
            allLabel: t("Tours.allScopes"),
            options: tourListFilters.scope.map((value) => ({ value, label: t(`Tours.scopes.${value}`) })),
          },
        ]}
        hidden={{ sort: query.sort, dir: query.dir }}
        labels={{ apply: t("Table.apply"), clear: t("Table.clearFilters") }}
        active={filtered}
      />
      <DataTable
        rows={items}
        columns={columns}
        rowKey={(row) => row.id}
        sort={{ key: params.sort, dir: params.dir }}
        page={params.page}
        pageCount={pageCount}
        hrefFor={(overrides) => listHref(BASE, query, overrides)}
        outOfRange={
          items.length === 0 && total > 0
            ? { message: t("Table.outOfRange"), lastPageLabel: t("Table.lastPage", { page: pageCount }) }
            : undefined
        }
        labels={{
          caption: t("Tours.title"),
          empty: filtered ? t("Table.emptyFiltered") : t("Table.empty"),
          sortAscending: t("Table.sortAscending"),
          sortDescending: t("Table.sortDescending"),
          pagination: {
            nav: t("Table.pagination"),
            previous: t("Table.previous"),
            next: t("Table.next"),
            page: (page) => t("Table.page", { page }),
          },
          total: t("Table.total", { count: total }),
        }}
      />
    </div>
  );
}
