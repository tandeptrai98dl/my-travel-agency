import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { currentQuery, listHref, parseListParams } from "@/lib/admin/list-params";
import { rolesFor } from "@/lib/auth/permissions";
import { INQUIRY_SORTS, INQUIRY_SOURCES, INQUIRY_STATUSES, type InquiryListRow, responseTime } from "@/modules/inquiry/inquiry-admin.schemas";
import { inquiryAssignees, listInquiries, managesAllInquiries } from "@/modules/inquiry/inquiry-admin.service";

import { requireAdminAccess } from "../../admin-gate";
import { adminDateTime } from "../bookings/format";
import { durationText } from "./duration";

export const metadata: Metadata = { title: "Yêu cầu tư vấn" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/inquiries";
const DEFAULTS = { sort: "created_at", dir: "desc" } as const;

/** The inquiry inbox (spec Phase 5 decision 9): sales roles, operator (read) and admin. */
export default async function InquiriesPage({ searchParams }: Props) {
  await requireAdminAccess(rolesFor("inquiries.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Inquiries" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<ListSkeleton />}>
        <InquiryList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-11 w-full max-w-3xl" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

async function InquiryList({ searchParams }: Props) {
  const user = await requireAdminAccess(rolesFor("inquiries.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const ti = await getTranslations({ locale: "vi", namespace: "Admin.Inquiries" });
  const format = await getFormatter({ locale: "vi" });
  const seeAll = managesAllInquiries(user.role) || user.role === "operator";
  const params = parseListParams(await searchParams, {
    sortable: INQUIRY_SORTS,
    defaultSort: DEFAULTS.sort,
    defaultDir: DEFAULTS.dir,
    pageSize: 25,
    filters: { status: INQUIRY_STATUSES, source: INQUIRY_SOURCES, owner: null },
  });
  const query = currentQuery(params, DEFAULTS);
  const [{ rows, total, pageCount }, assignees] = await Promise.all([listInquiries(params), seeAll ? inquiryAssignees() : Promise.resolve([])]);
  const now = Date.now();
  const sourceLabel = (source: string | null) =>
    (INQUIRY_SOURCES as readonly string[]).includes(source ?? "") ? ti(`sources.${source as (typeof INQUIRY_SOURCES)[number]}`) : ti("sources.other");

  const columns: DataTableColumn<InquiryListRow>[] = [
    {
      key: "code",
      header: ti("code"),
      className: "whitespace-nowrap",
      cell: (row) => (
        <Link href={`${BASE}/${row.id}`} className="font-medium underline underline-offset-4">
          {row.code}
        </Link>
      ),
    },
    {
      key: "customer",
      header: ti("customer"),
      cell: (row) => (
        <div className="flex flex-col">
          <span>{row.name}</span>
          <span className="break-all text-small text-muted-foreground">{row.email}</span>
        </div>
      ),
    },
    {
      key: "source",
      header: ti("source"),
      cell: (row) => (
        <div className="flex flex-col">
          <span>{sourceLabel(row.source)}</span>
          {row.tourCode && <code className="text-small text-muted-foreground">{row.tourCode}</code>}
        </div>
      ),
    },
    { key: "status", header: ti("status"), cell: (row) => <StatusBadge kind="inquiry" status={row.status} label={ti(`statuses.${row.status}`)} /> },
    { key: "owner", header: ti("owner"), cell: (row) => row.owner ?? <span className="text-muted-foreground">{ti("unassigned")}</span> },
    {
      key: "created",
      header: ti("receivedAt"),
      sortKey: "created_at",
      className: "whitespace-nowrap",
      cell: (row) => <time dateTime={row.createdAt}>{adminDateTime(format, row.createdAt)}</time>,
    },
    {
      key: "response",
      header: ti("response"),
      sortKey: "first_responded_at",
      className: "whitespace-nowrap",
      cell: (row) => {
        const answered = responseTime(row.createdAt, row.firstRespondedAt);
        if (answered !== null) return durationText(ti, answered);
        if (row.status === "spam") return <span className="text-muted-foreground">—</span>;
        return <span className="font-medium text-warning">{ti("waiting", { time: durationText(ti, Math.max(now - new Date(row.createdAt).getTime(), 0)) })}</span>;
      },
    },
  ];

  const filtered = Boolean(params.q || Object.keys(params.filters).length > 0);
  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        action={BASE}
        search={{ label: ti("search"), value: params.q }}
        selects={[
          {
            name: "status",
            label: ti("status"),
            value: params.filters.status,
            allLabel: ti("allStatuses"),
            options: INQUIRY_STATUSES.map((status) => ({ value: status, label: ti(`statuses.${status}`) })),
          },
          {
            name: "owner",
            label: ti("owner"),
            value: params.filters.owner,
            allLabel: ti("allOwners"),
            options: [{ value: "mine", label: ti("ownerMine") }, { value: "unassigned", label: ti("ownerUnassigned") }, ...assignees],
          },
          {
            name: "source",
            label: ti("source"),
            value: params.filters.source,
            allLabel: ti("allSources"),
            options: INQUIRY_SOURCES.map((source) => ({ value: source, label: ti(`sources.${source}`) })),
          },
        ]}
        hidden={{ sort: query.sort, dir: query.dir }}
        labels={{ apply: t("Table.apply"), clear: t("Table.clearFilters") }}
        active={filtered}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        sort={{ key: params.sort, dir: params.dir }}
        page={params.page}
        pageCount={pageCount}
        hrefFor={(overrides) => listHref(BASE, query, overrides)}
        outOfRange={
          rows.length === 0 && total > 0 ? { message: t("Table.outOfRange"), lastPageLabel: t("Table.lastPage", { page: pageCount }) } : undefined
        }
        labels={{
          caption: ti("title"),
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
