import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { currentQuery, listHref, parseListParams } from "@/lib/admin/list-params";
import { can, rolesFor } from "@/lib/auth/permissions";
import { formatVnd } from "@/lib/money";
import { BOOKING_SORTS, BOOKING_STATUSES, type BookingListRow } from "@/modules/booking/booking-admin.schemas";
import { bookingFilterOptions, listBookings } from "@/modules/booking/booking-admin.service";

import { requireAdminAccess } from "../../admin-gate";
import { adminDate, adminDateTime } from "./format";

export const metadata: Metadata = { title: "Đặt tour" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/bookings";
const DEFAULTS = { sort: "created_at", dir: "desc" } as const;

/** Bookings list (spec Phase 4 step 16): sales, operator, accountant and admin. */
export default async function BookingsPage({ searchParams }: Props) {
  const user = await requireAdminAccess(rolesFor("bookings.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("Bookings.title")}
        description={t("Bookings.description")}
        actions={
          <div className="flex flex-wrap gap-3">
            <Link href={`${BASE}/attention`} className={buttonVariants({ variant: "outline" })}>
              {t("Bookings.queueLink")}
            </Link>
            {can(user.role, "bookings.edit") && (
              <Link href={`${BASE}/new`} className={buttonVariants()}>
                {t("Quote.new")}
              </Link>
            )}
          </div>
        }
      />
      <Suspense fallback={<ListSkeleton />}>
        <BookingList searchParams={searchParams} />
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

async function BookingList({ searchParams }: Props) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const params = parseListParams(await searchParams, {
    sortable: BOOKING_SORTS,
    defaultSort: DEFAULTS.sort,
    defaultDir: DEFAULTS.dir,
    pageSize: 25,
    filters: { status: BOOKING_STATUSES, tour: null, owner: null, departure: null, attention: ["1"] },
  });
  const query = currentQuery(params, DEFAULTS);
  const [{ rows, total, pageCount }, options] = await Promise.all([listBookings(params), bookingFilterOptions()]);

  const columns: DataTableColumn<BookingListRow>[] = [
    {
      key: "code",
      header: t("Bookings.code"),
      sortKey: "code",
      className: "whitespace-nowrap",
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <Link href={`${BASE}/${row.id}`} className="font-medium underline underline-offset-4">
            {row.code}
          </Link>
          {row.needsAttention && <Badge variant="warning">{t("Bookings.flagged")}</Badge>}
        </div>
      ),
    },
    {
      key: "tour",
      header: t("Bookings.tour"),
      cell: (row) => (
        <div className="flex flex-col">
          <code className="text-small">{row.tourCode}</code>
          <span className="text-small text-muted-foreground">{row.tourTitle}</span>
        </div>
      ),
    },
    {
      key: "start",
      header: t("Bookings.startDate"),
      sortKey: "start_date",
      className: "whitespace-nowrap",
      cell: (row) => <time dateTime={row.startDate}>{adminDate(format, row.startDate)}</time>,
    },
    {
      key: "contact",
      header: t("Bookings.contact"),
      cell: (row) => (
        <div className="flex flex-col">
          <span>{row.contactName}</span>
          <span className="break-all text-small text-muted-foreground">{row.contactEmail}</span>
        </div>
      ),
    },
    { key: "travellers", header: t("Bookings.travellers"), cell: (row) => row.travellers },
    {
      key: "amount",
      header: t("Bookings.amount"),
      sortKey: "total",
      className: "whitespace-nowrap",
      cell: (row) => (
        <span>
          {formatVnd(row.amountPaid, "vi")} / {formatVnd(row.total, "vi")}
        </span>
      ),
    },
    {
      key: "status",
      header: t("Bookings.status"),
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge kind="booking" status={row.status} label={t(`Bookings.statuses.${row.status}`)} />
          <StatusBadge kind="payment" status={row.paymentState} label={t(`Bookings.paymentStates.${row.paymentState}`)} />
        </div>
      ),
    },
    {
      key: "owner",
      header: t("Bookings.owner"),
      cell: (row) => row.owner ?? <span className="text-muted-foreground">{t("Bookings.unassigned")}</span>,
    },
    {
      key: "created",
      header: t("Bookings.createdAt"),
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
        search={{ label: t("Bookings.search"), value: params.q }}
        selects={[
          {
            name: "status",
            label: t("Bookings.status"),
            value: params.filters.status,
            allLabel: t("Bookings.allStatuses"),
            options: BOOKING_STATUSES.map((status) => ({ value: status, label: t(`Bookings.statuses.${status}`) })),
          },
          { name: "tour", label: t("Bookings.tour"), value: params.filters.tour, allLabel: t("Bookings.allTours"), options: options.tours },
          { name: "owner", label: t("Bookings.owner"), value: params.filters.owner, allLabel: t("Bookings.allOwners"), options: options.owners },
          {
            name: "attention",
            label: t("Bookings.attention"),
            value: params.filters.attention,
            allLabel: t("Bookings.attentionAll"),
            options: [{ value: "1", label: t("Bookings.attentionOnly") }],
          },
        ]}
        hidden={{ sort: query.sort, dir: query.dir, departure: params.filters.departure }}
        labels={{ apply: t("Table.apply"), clear: t("Table.clearFilters") }}
        active={filtered}
      />
      {params.filters.departure && (
        <Alert>
          <AlertDescription>{t("Bookings.departureFilter")}</AlertDescription>
        </Alert>
      )}
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
          caption: t("Bookings.title"),
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
