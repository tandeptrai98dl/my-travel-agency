import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminMessages } from "@/components/admin/admin-messages";
import { ExportSubscribersButton } from "@/components/admin/content/export-subscribers-button";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { currentQuery, listHref, parseListParams } from "@/lib/admin/list-params";
import { rolesFor } from "@/lib/auth/permissions";
import { SUBSCRIBER_STATES, subscriberListFilters, SUBSCRIBERS_PAGE_SIZE } from "@/modules/content/subscribers.schemas";
import { listSubscribers, type SubscriberItem } from "@/modules/content/subscribers.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Người nhận bản tin" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/subscribers";
const DEFAULTS = { sort: "created_at", dir: "desc" } as const;
const STATE_VARIANT = { active: "success", pending: "warning", unsubscribed: "outline" } as const;

/** Newsletter subscribers (spec Phase 2 step 20): a read-only list and an audited CSV export. */
export default async function SubscribersPage({ searchParams }: Props) {
  await requireAdminAccess(rolesFor("newsletter.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Content.subscribers" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <AdminMessages namespaces={["Content", "Taxonomy"]}>
            <ExportSubscribersButton />
          </AdminMessages>
        }
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
        <SubscriberList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SubscriberList({ searchParams }: Props) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const params = parseListParams(await searchParams, {
    sortable: ["created_at"],
    defaultSort: DEFAULTS.sort,
    defaultDir: DEFAULTS.dir,
    pageSize: SUBSCRIBERS_PAGE_SIZE,
    filters: subscriberListFilters,
  });
  const query = currentQuery(params, DEFAULTS);
  const { items, total, pageCount } = await listSubscribers(params);
  const date = (value: string | null) =>
    value ? <time dateTime={value}>{format.dateTime(new Date(value), { day: "2-digit", month: "2-digit", year: "numeric" })}</time> : "—";
  const columns: DataTableColumn<SubscriberItem>[] = [
    { key: "email", header: t("Content.subscribers.email"), cell: (row) => <span className="break-all">{row.email}</span> },
    {
      key: "state",
      header: t("Content.subscribers.state"),
      cell: (row) => <Badge variant={STATE_VARIANT[row.state]}>{t(`Content.subscribers.states.${row.state}`)}</Badge>,
    },
    { key: "locale", header: t("Content.subscribers.locale"), cell: (row) => t(`Form.${row.locale}`) },
    { key: "source", header: t("Content.subscribers.source"), cell: (row) => row.source ?? "—" },
    { key: "confirmed", header: t("Content.subscribers.confirmed"), className: "whitespace-nowrap", cell: (row) => date(row.confirmedAt) },
    { key: "created", header: t("Content.subscribers.created"), className: "whitespace-nowrap", cell: (row) => date(row.createdAt) },
  ];
  const filtered = Boolean(params.q || Object.keys(params.filters).length);
  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        action={BASE}
        search={{ label: t("Content.subscribers.search"), value: params.q }}
        selects={[
          {
            name: "state",
            label: t("Content.subscribers.state"),
            value: params.filters.state,
            allLabel: t("Content.subscribers.allStates"),
            options: SUBSCRIBER_STATES.map((value) => ({ value, label: t(`Content.subscribers.states.${value}`) })),
          },
        ]}
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
          caption: t("Content.subscribers.title"),
          empty: filtered ? t("Table.emptyFiltered") : t("Content.subscribers.empty"),
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
