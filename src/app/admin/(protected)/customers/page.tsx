import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { CustomerStateBadge } from "@/components/admin/customers/customer-state-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { currentQuery, listHref, parseListParams } from "@/lib/admin/list-params";
import { can, rolesFor } from "@/lib/auth/permissions";
import { CUSTOMER_SORTS, CUSTOMER_STATES, type CustomerListRow } from "@/modules/account/customers-admin.schemas";
import { listCustomers, listDeletionRequests } from "@/modules/account/customers-admin.service";

import { requireAdminAccess } from "../../admin-gate";
import { adminDateTime } from "../bookings/format";

export const metadata: Metadata = { title: "Khách hàng" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/customers";
const DEFAULTS = { sort: "created_at", dir: "desc" } as const;

/**
 * Customers (spec Phase 5 decision 16): the staff roles that read customers search by name or
 * email; an MFA-verified admin also sees the open deletion requests with what blocks them.
 */
export default async function CustomersPage({ searchParams }: Props) {
  const user = await requireAdminAccess(rolesFor("customers.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Operations.Customers" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader title={t("title")} description={t("description")} />
      {can(user.role, "customers.delete_data") && (
        <Suspense fallback={<Skeleton className="h-24 w-full" aria-hidden="true" />}>
          <DeletionRequests />
        </Suspense>
      )}
      <Suspense fallback={<Skeleton className="h-96 w-full" aria-hidden="true" />}>
        <CustomerList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DeletionRequests() {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Operations.Customers" });
  const format = await getFormatter({ locale: "vi" });
  const requests = await listDeletionRequests();
  return (
    <section aria-labelledby="deletion-requests-title" id="deletion-requests" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <h2 id="deletion-requests-title" className="font-serif text-h3 font-semibold">
        {t("Deletion.openTitle")}
      </h2>
      {requests.length === 0 ? (
        <p className="text-small text-muted-foreground">{t("Deletion.none")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border" data-testid="deletion-requests">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1">
                <Link href={`${BASE}/${request.id}`} className="break-all font-medium underline underline-offset-4">
                  {request.fullName || request.email}
                </Link>
                <span className="text-small text-muted-foreground">
                  {t("Deletion.requestedAt", { date: adminDateTime(format, request.requestedAt) })}
                </span>
              </div>
              <span className="text-small">
                {request.profileDeleted
                  ? t("Deletion.authPending")
                  : request.blockers.length > 0
                    ? t("Deletion.blockedBy", { reasons: request.blockers.map((reason) => t(`blockers.${reason as "balance_due"}`)).join(", ") })
                    : t("Deletion.ready")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function CustomerList({ searchParams }: Props) {
  await requireAdminAccess(rolesFor("customers.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const tc = await getTranslations({ locale: "vi", namespace: "Admin.Operations.Customers" });
  const format = await getFormatter({ locale: "vi" });
  const params = parseListParams(await searchParams, {
    sortable: CUSTOMER_SORTS,
    defaultSort: DEFAULTS.sort,
    defaultDir: DEFAULTS.dir,
    pageSize: 25,
    filters: { state: CUSTOMER_STATES },
  });
  const query = currentQuery(params, DEFAULTS);
  const { rows, total, pageCount } = await listCustomers(params);

  const columns: DataTableColumn<CustomerListRow>[] = [
    {
      key: "name",
      header: tc("name"),
      sortKey: "full_name",
      cell: (row) => (
        <Link href={`${BASE}/${row.id}`} className="font-medium underline underline-offset-4">
          {row.fullName || tc("noName")}
        </Link>
      ),
    },
    { key: "email", header: tc("email"), sortKey: "email", cell: (row) => <span className="break-all">{row.email}</span> },
    { key: "phone", header: tc("phone"), cell: (row) => row.phone ?? <span className="text-muted-foreground">—</span> },
    { key: "state", header: tc("state"), cell: (row) => <CustomerStateBadge state={row.state} label={tc(`states.${row.state}`)} /> },
    {
      key: "created",
      header: tc("createdAt"),
      sortKey: "created_at",
      className: "whitespace-nowrap",
      cell: (row) => <time dateTime={row.createdAt}>{adminDateTime(format, row.createdAt)}</time>,
    },
  ];

  const filtered = Boolean(params.q || Object.keys(params.filters).length > 0);
  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        action={BASE}
        search={{ label: tc("search"), value: params.q }}
        selects={[
          {
            name: "state",
            label: tc("state"),
            value: params.filters.state,
            allLabel: tc("allStates"),
            options: CUSTOMER_STATES.map((state) => ({ value: state, label: tc(`states.${state}`) })),
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
          caption: tc("title"),
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
