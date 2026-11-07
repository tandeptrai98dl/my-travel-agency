import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminMessages } from "@/components/admin/admin-messages";
import { AssignTransferForm } from "@/components/admin/bookings/assign-transfer-form";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { currentQuery, listHref, parseListParams } from "@/lib/admin/list-params";
import { can, rolesFor } from "@/lib/auth/permissions";
import { formatVnd } from "@/lib/money";
import {
  LEDGER_PROVIDERS,
  type LedgerRow,
  PAYMENT_KINDS,
  PAYMENT_SORTS,
  TRANSACTION_STATUSES,
} from "@/modules/payment/payment-admin.schemas";
import { listPayments, listUnmatchedTransfers } from "@/modules/payment/payment-admin.service";

import { requireAdminAccess } from "../../admin-gate";
import { adminDateTime } from "../bookings/format";

export const metadata: Metadata = { title: "Thanh toán" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/payments";
const DEFAULTS = { sort: "created_at", dir: "desc" } as const;

/** Payments ledger (spec Phase 4 step 17); unmatched transfers for accountants and admins. */
export default async function PaymentsPage({ searchParams }: Props) {
  await requireAdminAccess(rolesFor("payments.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return (
    <div className="flex flex-col gap-10 px-4 py-10 md:px-8">
      <PageHeader title={t("Payments.title")} description={t("Payments.description")} />
      <Suspense fallback={<Skeleton className="h-48 w-full" aria-hidden="true" />}>
        <Unmatched />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-96 w-full" aria-hidden="true" />}>
        <Ledger searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Unmatched() {
  const user = await requireAdminAccess(rolesFor("payments.read"));
  if (!can(user.role, "payments.record")) return null;
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const transfers = await listUnmatchedTransfers();
  return (
    <section id="unmatched" aria-labelledby="unmatched-title" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <h2 id="unmatched-title" className="font-serif text-h3 font-semibold">
        {t("Payments.unmatchedTitle")}
      </h2>
      <p className="max-w-[680px] text-small text-muted-foreground">{t("Payments.unmatchedHelp")}</p>
      {transfers.length === 0 ? (
        <p className="text-small">{t("Payments.unmatchedEmpty")}</p>
      ) : (
        <AdminMessages namespaces={["Payments", "BookingDetail", "Bookings"]}>
          <ul className="flex flex-col gap-4">
            {transfers.map((transfer) => (
              <li key={transfer.id} className="flex flex-col gap-3 border-t border-border pt-4">
                <p id={`transfer-${transfer.id}`} className="flex flex-wrap gap-x-4 gap-y-1 text-small">
                  <span className="font-semibold">
                    {transfer.amount != null ? formatVnd(transfer.amount, "vi") : t("Payments.unknownAmount")}
                  </span>
                  <span>
                    {t("Payments.memo")}: {transfer.memo || t("Payments.noMemo")}
                  </span>
                  <span className="text-muted-foreground">
                    {t("Payments.receivedAt")} <time dateTime={transfer.receivedAt}>{adminDateTime(format, transfer.receivedAt)}</time>
                  </span>
                </p>
                <AssignTransferForm eventId={transfer.id} labelledBy={`transfer-${transfer.id}`} />
              </li>
            ))}
          </ul>
        </AdminMessages>
      )}
    </section>
  );
}

async function Ledger({ searchParams }: Props) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const params = parseListParams(await searchParams, {
    sortable: PAYMENT_SORTS,
    defaultSort: DEFAULTS.sort,
    defaultDir: DEFAULTS.dir,
    pageSize: 50,
    filters: { provider: LEDGER_PROVIDERS, status: TRANSACTION_STATUSES, kind: PAYMENT_KINDS },
  });
  const query = currentQuery(params, DEFAULTS);
  const { rows, total, pageCount } = await listPayments(params);

  const columns: DataTableColumn<LedgerRow>[] = [
    {
      key: "created",
      header: t("Payments.createdAt"),
      sortKey: "created_at",
      className: "whitespace-nowrap",
      cell: (row) => <time dateTime={row.createdAt}>{adminDateTime(format, row.createdAt)}</time>,
    },
    {
      key: "reference",
      header: t("Payments.reference"),
      cell: (row) => (
        <div className="flex flex-col">
          <code className="text-small">{row.reference}</code>
          <span className="text-small text-muted-foreground">{t(`Bookings.kinds.${row.kind}`)}</span>
        </div>
      ),
    },
    {
      key: "booking",
      header: t("Payments.booking"),
      cell: (row) =>
        row.bookingId ? (
          <Link href={`/admin/bookings/${row.bookingId}`} className="underline underline-offset-4">
            {row.bookingCode}
          </Link>
        ) : null,
    },
    { key: "provider", header: t("Payments.provider"), cell: (row) => t(`Bookings.providers.${row.provider}`) },
    {
      key: "status",
      header: t("Payments.status"),
      cell: (row) => <StatusBadge kind="transaction" status={row.status} label={t(`Bookings.transactionStatuses.${row.status}`)} />,
    },
    {
      key: "amount",
      header: t("Payments.amount"),
      sortKey: "amount",
      className: "whitespace-nowrap text-right",
      cell: (row) => `${row.kind === "refund" ? "−" : ""}${formatVnd(row.amount, "vi")}`,
    },
    {
      key: "paid",
      header: t("Payments.paidAt"),
      sortKey: "paid_at",
      className: "whitespace-nowrap",
      cell: (row) => (row.paidAt ? <time dateTime={row.paidAt}>{adminDateTime(format, row.paidAt)}</time> : "—"),
    },
    {
      key: "note",
      header: t("Payments.note"),
      cell: (row) => (
        <div className="flex flex-col text-small">
          {row.note && <span className="break-words">{row.note}</span>}
          {row.recordedBy && <span className="text-muted-foreground">{t("BookingDetail.recordedBy", { name: row.recordedBy })}</span>}
        </div>
      ),
    },
  ];

  const filtered = Boolean(params.q || Object.keys(params.filters).length > 0);
  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        action={BASE}
        search={{ label: t("Payments.search"), value: params.q }}
        selects={[
          {
            name: "provider",
            label: t("Payments.provider"),
            value: params.filters.provider,
            allLabel: t("Payments.allProviders"),
            options: LEDGER_PROVIDERS.map((value) => ({ value, label: t(`Bookings.providers.${value}`) })),
          },
          {
            name: "status",
            label: t("Payments.status"),
            value: params.filters.status,
            allLabel: t("Payments.allStatuses"),
            options: TRANSACTION_STATUSES.map((value) => ({ value, label: t(`Bookings.transactionStatuses.${value}`) })),
          },
          {
            name: "kind",
            label: t("Payments.kind"),
            value: params.filters.kind,
            allLabel: t("Payments.allKinds"),
            options: PAYMENT_KINDS.map((value) => ({ value, label: t(`Bookings.kinds.${value}`) })),
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
          rows.length === 0 && total > 0
            ? { message: t("Table.outOfRange"), lastPageLabel: t("Table.lastPage", { page: pageCount }) }
            : undefined
        }
        labels={{
          caption: t("Payments.title"),
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
