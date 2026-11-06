import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { currentQuery, listHref, parseListParams } from "@/lib/admin/list-params";
import { rolesFor } from "@/lib/auth/permissions";
import { AUDIT_SORTS, AUDITED_ENTITIES, type AuditEntry } from "@/modules/audit/audit.schemas";
import { listAuditLogs } from "@/modules/audit/audit.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Nhật ký thay đổi" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/audit-log";
const DEFAULTS = { sort: "created_at", dir: "desc" } as const;
const OP_VARIANT = { insert: "success", update: "secondary", delete: "destructive" } as const;

/** Admin-only audit log with before/after values (spec Phase 2 step 4). */
export default async function AuditLogPage({ searchParams }: Props) {
  await requireAdminAccess(rolesFor("audit.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader title={t("Audit.title")} description={t("Audit.description")} />
      {/* The list reads the URL, so it streams in its own boundary (Cache Components). */}
      <Suspense fallback={<ListSkeleton />}>
        <AuditLogList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-11 w-full max-w-xl" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

async function AuditLogList({ searchParams }: Props) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });

  const params = parseListParams(await searchParams, {
    sortable: AUDIT_SORTS,
    defaultSort: DEFAULTS.sort,
    defaultDir: DEFAULTS.dir,
    pageSize: 50,
    filters: { entity: AUDITED_ENTITIES },
  });
  const query = currentQuery(params, DEFAULTS);
  const { entries, total, pageCount } = await listAuditLogs(params);

  const columns: DataTableColumn<AuditEntry>[] = [
    {
      key: "time",
      header: t("Audit.time"),
      sortKey: "created_at",
      className: "whitespace-nowrap",
      cell: (row) => (
        <time dateTime={row.createdAt}>
          {format.dateTime(new Date(row.createdAt), {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: "Asia/Ho_Chi_Minh",
          })}
        </time>
      ),
    },
    {
      key: "action",
      header: t("Audit.action"),
      sortKey: "action",
      cell: (row) =>
        row.operation ? (
          <Badge variant={OP_VARIANT[row.operation]}>{t(`Audit.actions.${row.operation}`)}</Badge>
        ) : (
          <code>{row.action}</code>
        ),
    },
    {
      key: "entity",
      header: t("Audit.entity"),
      sortKey: "entity_type",
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <code className="text-small">{row.entityType}</code>
          <code className="break-all text-[0.75rem] text-muted-foreground">{row.entityId}</code>
        </div>
      ),
    },
    {
      key: "actor",
      header: t("Audit.actor"),
      cell: (row) =>
        row.actor ? (
          <span className="break-all">{row.actor.name ?? row.actor.email}</span>
        ) : (
          <span className="text-muted-foreground">{t("Audit.system")}</span>
        ),
    },
    {
      key: "changes",
      header: t("Audit.changes"),
      className: "w-[40%]",
      cell: (row) => (
        <details>
          <summary className="cursor-pointer text-small underline underline-offset-4">{t("Audit.details")}</summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-secondary p-3 text-[0.75rem] leading-relaxed">
            {JSON.stringify(row.changes, null, 2)}
          </pre>
        </details>
      ),
    },
  ];

  const filtered = Boolean(params.q || params.filters.entity);

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        action={BASE}
        search={{ label: t("Audit.entityId"), value: params.q }}
        selects={[
          {
            name: "entity",
            label: t("Audit.entity"),
            value: params.filters.entity,
            allLabel: t("Audit.allEntities"),
            options: AUDITED_ENTITIES.map((entity) => ({ value: entity, label: entity })),
          },
        ]}
        hidden={{ sort: query.sort, dir: query.dir }}
        labels={{ apply: t("Table.apply"), clear: t("Table.clearFilters") }}
        active={filtered}
      />
      <DataTable
        rows={entries}
        columns={columns}
        rowKey={(row) => row.id}
        sort={{ key: params.sort, dir: params.dir }}
        page={params.page}
        pageCount={pageCount}
        hrefFor={(overrides) => listHref(BASE, query, overrides)}
        labels={{
          caption: t("Audit.title"),
          empty: filtered ? t("Table.emptyFiltered") : t("Table.empty"),
          sortBy: (column) => t("Table.sortBy", { column }),
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
