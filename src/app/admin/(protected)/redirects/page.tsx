import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminMessages } from "@/components/admin/admin-messages";
import { DeleteRedirectButton, ResyncRedirectsButton } from "@/components/admin/content/redirect-buttons";
import { RedirectForm } from "@/components/admin/content/redirect-form";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { currentQuery, listHref, parseListParams } from "@/lib/admin/list-params";
import { rolesFor } from "@/lib/auth/permissions";
import { isRedisConfigured } from "@/lib/redis";
import { REDIRECTS_PAGE_SIZE } from "@/modules/content/redirects.schemas";
import { listRedirects, type RedirectItem } from "@/modules/content/redirects.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Chuyển hướng" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/redirects";
const DEFAULTS = { sort: "created_at", dir: "desc" } as const;

/** Redirects (spec Phase 2 step 20, decisions 4 and 5): editors and admins. */
export default async function RedirectsPage({ searchParams }: Props) {
  await requireAdminAccess(rolesFor("redirects.manage"));
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <Suspense fallback={<Skeleton className="h-24 w-full" aria-hidden="true" />}>
        <Header />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
        <RedirectList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Header() {
  await requireAdminAccess(rolesFor("redirects.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Content.redirects" });
  const redis = isRedisConfigured();
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <AdminMessages namespaces={["Content", "Taxonomy", "Form", "Shell"]}>
            <ResyncRedirectsButton redisConfigured={redis} />
          </AdminMessages>
        }
      />
      {!redis && (
        <Alert variant="warning">
          <AlertDescription>{t("redisMissing")}</AlertDescription>
        </Alert>
      )}
      <AdminMessages namespaces={["Content", "Taxonomy", "Form", "Shell"]}>
        <RedirectForm redisConfigured={redis} />
      </AdminMessages>
    </>
  );
}

async function RedirectList({ searchParams }: Props) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const params = parseListParams(await searchParams, {
    sortable: ["created_at"],
    defaultSort: DEFAULTS.sort,
    defaultDir: DEFAULTS.dir,
    pageSize: REDIRECTS_PAGE_SIZE,
  });
  const query = currentQuery(params, DEFAULTS);
  const { items, total, pageCount } = await listRedirects(params);
  const columns: DataTableColumn<RedirectItem>[] = [
    { key: "from", header: t("Content.redirects.fromPath"), cell: (row) => <code className="break-all">{row.fromPath}</code> },
    { key: "to", header: t("Content.redirects.toPath"), cell: (row) => <code className="break-all">{row.toPath}</code> },
    {
      key: "status",
      header: t("Content.redirects.statusCode"),
      className: "whitespace-nowrap",
      cell: (row) => (row.statusCode === 301 ? t("Content.redirects.permanent") : t("Content.redirects.temporary")),
    },
    { key: "hits", header: t("Content.redirects.hits"), className: "tabular-nums", cell: (row) => row.hits },
    {
      key: "created",
      header: t("Content.redirects.created_at"),
      className: "whitespace-nowrap",
      cell: (row) => (
        <time dateTime={row.createdAt}>{format.dateTime(new Date(row.createdAt), { day: "2-digit", month: "2-digit", year: "numeric" })}</time>
      ),
    },
    {
      key: "actions",
      header: t("Table.actions"),
      cell: (row) => <DeleteRedirectButton id={row.id} fromPath={row.fromPath} />,
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        action={BASE}
        search={{ label: t("Content.redirects.search"), value: params.q }}
        labels={{ apply: t("Table.apply"), clear: t("Table.clearFilters") }}
        active={Boolean(params.q)}
      />
      {/* One provider for every row's delete button. */}
      <AdminMessages namespaces={["Content", "Taxonomy", "Form", "Shell"]}>
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
          caption: t("Content.redirects.title"),
          empty: params.q ? t("Table.emptyFiltered") : t("Content.redirects.empty"),
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
      </AdminMessages>
    </div>
  );
}
