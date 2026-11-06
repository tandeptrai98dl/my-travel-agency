import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { DepartureCalendar } from "@/components/admin/departures/departure-calendar";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { currentQuery, listHref, parseListParams } from "@/lib/admin/list-params";
import { can, rolesFor } from "@/lib/auth/permissions";
import { addMonths, monthOf, monthWeeks, todayInVietnam } from "@/lib/dates";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  DEPARTURE_SORTS,
  DEPARTURE_STATUSES,
  departureFilters,
  departureListFilters,
  DEPARTURES_PAGE_SIZE,
  departureView,
} from "@/modules/catalog/departures/departures.schemas";
import {
  CALENDAR_LIMIT,
  departureMonth,
  type DepartureListItem,
  listDepartures,
  tourOptions,
} from "@/modules/catalog/departures/departures.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Lịch khởi hành" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/departures";
const DEFAULTS = { sort: "start_date", dir: "asc" } as const;

/**
 * Departures (spec Phase 2 step 14): a table and a month calendar for every staff role; operators
 * and admins add and edit. Seats are shown as reserved / capacity and never edited here (ADR-012).
 */
export default async function DeparturesPage({ searchParams }: Props) {
  const user = await requireAdminAccess(rolesFor("tours.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Departures" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          can(user.role, "departures.edit") ? (
            <Button asChild>
              <Link href={`${BASE}/new`}>
                <Plus strokeWidth={1.5} aria-hidden="true" />
                {t("newDepartures")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      {/* Reads the URL, so it streams in its own boundary (Cache Components). */}
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
        <DepartureList searchParams={searchParams} canEdit={can(user.role, "departures.edit")} />
      </Suspense>
    </div>
  );
}

async function DepartureList({ searchParams, canEdit }: Props & { canEdit: boolean }) {
  const raw = await searchParams;
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const params = parseListParams(raw, {
    sortable: DEPARTURE_SORTS,
    defaultSort: DEFAULTS.sort,
    defaultDir: DEFAULTS.dir,
    pageSize: DEPARTURES_PAGE_SIZE,
    filters: departureListFilters,
  });
  const filters = departureFilters(params.filters);
  const view = departureView(raw.view);
  const today = todayInVietnam();
  const query: Record<string, string | undefined> = {
    ...currentQuery(params, DEFAULTS),
    view: view === "table" ? undefined : view,
  };
  const tours = await tourOptions();

  const date = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00`), { day: "2-digit", month: "2-digit", year: "numeric" });
  const editHref = canEdit ? (id: string) => `${BASE}/${id}` : undefined;
  const statusLabel = (status: DepartureListItem["status"]) => t(`Departures.statuses.${status}`);
  const seats = (item: DepartureListItem) => `${item.seatsReserved}/${item.capacity}`;
  const seatsLabel = (item: DepartureListItem) =>
    t("Departures.seatsLabel", { reserved: item.seatsReserved, capacity: item.capacity });

  // Months to filter by: a year back, a year and a half ahead (the seed and sales plan seasons).
  const thisMonth = monthOf(today);
  const months = Array.from({ length: 31 }, (_, i) => addMonths(thisMonth, i - 12));
  const monthLabel = (month: string) =>
    t("Departures.monthOption", { month: Number(month.slice(5)), year: month.slice(0, 4) });

  const filtered = Boolean(Object.keys(params.filters).length);
  const viewLink = (target: "table" | "calendar", label: string) => (
    <Button asChild variant={view === target ? "secondary" : "ghost"} size="sm">
      <Link
        href={listHref(BASE, query, { view: target === "table" ? null : target, page: null })}
        aria-current={view === target ? "page" : undefined}
        className={cn(view === target && "font-semibold")}
      >
        {label}
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        action={BASE}
        selects={[
          {
            name: "tour",
            label: t("Departures.tour"),
            value: filters.tourId,
            allLabel: t("Departures.allTours"),
            options: tours.map((tour) => ({ value: tour.id, label: `${tour.code} · ${tour.title}` })),
          },
          {
            name: "status",
            label: t("Departures.status"),
            value: filters.status,
            allLabel: t("Departures.allStatuses"),
            options: DEPARTURE_STATUSES.map((value) => ({ value, label: statusLabel(value) })),
          },
          {
            name: "month",
            label: t("Departures.month"),
            value: filters.month,
            allLabel: view === "calendar" ? t("Departures.thisMonth") : t("Departures.upcoming"),
            options: months.map((value) => ({ value, label: monthLabel(value) })),
          },
        ]}
        hidden={{ sort: query.sort, dir: query.dir, view: query.view }}
        labels={{ apply: t("Table.apply"), clear: t("Table.clearFilters") }}
        active={filtered}
      />
      <nav aria-label={t("Departures.viewLabel")} className="flex gap-2">
        {viewLink("table", t("Departures.views.table"))}
        {viewLink("calendar", t("Departures.views.calendar"))}
      </nav>
      {view === "calendar" ? (
        <CalendarView
          month={filters.month ?? thisMonth}
          filters={filters}
          query={query}
          today={today}
          editHref={editHref}
          labels={{
            status: statusLabel,
            seats,
            seatsLabel,
            monthLabel,
            dayLabel: (day) =>
              format.dateTime(new Date(`${day}T00:00:00`), { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
          }}
        />
      ) : (
        <TableView
          params={params}
          filters={filters}
          query={query}
          date={date}
          editHref={editHref}
          labels={{ status: statusLabel, seats, seatsLabel }}
          filtered={filtered}
        />
      )}
    </div>
  );
}

type Shared = {
  filters: ReturnType<typeof departureFilters>;
  query: Record<string, string | undefined>;
  editHref?: (id: string) => string;
};

async function TableView({
  params,
  filters,
  query,
  date,
  editHref,
  labels,
  filtered,
}: Shared & {
  params: ReturnType<typeof parseListParams<(typeof DEPARTURE_SORTS)[number]>>;
  date: (value: string) => string;
  labels: {
    status: (status: DepartureListItem["status"]) => string;
    seats: (item: DepartureListItem) => string;
    seatsLabel: (item: DepartureListItem) => string;
  };
  filtered: boolean;
}) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const { items, total, pageCount } = await listDepartures({ filters, sort: params.sort, dir: params.dir, page: params.page });
  const columns: DataTableColumn<DepartureListItem>[] = [
    {
      key: "dates",
      header: t("Departures.columns.dates"),
      sortKey: "start_date",
      className: "whitespace-nowrap",
      cell: (row) => {
        const range = (
          <>
            <time dateTime={row.startDate}>{date(row.startDate)}</time> – <time dateTime={row.endDate}>{date(row.endDate)}</time>
          </>
        );
        return editHref ? (
          <Link
            href={editHref(row.id)}
            className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {range}
          </Link>
        ) : (
          range
        );
      },
    },
    {
      key: "tour",
      header: t("Departures.columns.tour"),
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <code>{row.tourCode}</code>
          <span className="text-small text-muted-foreground">{row.tourTitle}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: t("Departures.columns.status"),
      cell: (row) => <StatusBadge kind="departure" status={row.status} label={labels.status(row.status)} />,
    },
    {
      key: "seats",
      header: t("Departures.columns.seats"),
      sortKey: "seats_reserved",
      className: "whitespace-nowrap tabular-nums",
      cell: (row) => (
        <span className="flex flex-col">
          <span aria-hidden="true">{labels.seats(row)}</span>
          <span className="sr-only">{labels.seatsLabel(row)}</span>
          {row.seatsReserved >= row.capacity && (
            <span className="text-small text-warning">{t("Departures.full")}</span>
          )}
        </span>
      ),
    },
    {
      key: "price",
      header: t("Departures.columns.price"),
      className: "whitespace-nowrap tabular-nums",
      cell: (row) => formatVnd(row.priceAdult, "vi"),
    },
    {
      key: "note",
      header: t("Departures.columns.note"),
      cell: (row) => (row.note ? <span className="line-clamp-2 text-small">{row.note}</span> : null),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      {!filters.month && <p className="text-small text-muted-foreground">{t("Departures.upcomingHint")}</p>}
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
          caption: t("Departures.title"),
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

async function CalendarView({
  month,
  filters,
  query,
  today,
  editHref,
  labels,
}: Shared & {
  month: string;
  today: string;
  labels: {
    status: (status: DepartureListItem["status"]) => string;
    seats: (item: DepartureListItem) => string;
    seatsLabel: (item: DepartureListItem) => string;
    monthLabel: (month: string) => string;
    dayLabel: (day: string) => string;
  };
}) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Departures" });
  const { byDate, total, truncated } = await departureMonth(month, { status: filters.status, tourId: filters.tourId });
  const monthHref = (target: string) => listHref(BASE, query, { month: target, page: null });
  return (
    <section aria-labelledby="calendar-month" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="calendar-month" className="font-serif text-h3 font-semibold">
          {labels.monthLabel(month)}
        </h2>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={monthHref(addMonths(month, -1))}>
              <ChevronLeft strokeWidth={1.5} aria-hidden="true" />
              {t("previousMonth")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={monthHref(addMonths(month, 1))}>
              {t("nextMonth")}
              <ChevronRight strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
      <p className="text-small text-muted-foreground">{t("monthTotal", { count: total })}</p>
      {truncated && (
        <Alert>
          <AlertDescription>{t("truncated", { count: total, limit: CALENDAR_LIMIT })}</AlertDescription>
        </Alert>
      )}
      <DepartureCalendar
        weeks={monthWeeks(month)}
        byDate={byDate}
        today={today}
        editHref={editHref}
        labels={{
          caption: t("calendarCaption", { month: labels.monthLabel(month) }),
          weekdays: [t("weekdays.mon"), t("weekdays.tue"), t("weekdays.wed"), t("weekdays.thu"), t("weekdays.fri"), t("weekdays.sat"), t("weekdays.sun")],
          dayLabel: labels.dayLabel,
          status: labels.status,
          seats: labels.seats,
          seatsLabel: labels.seatsLabel,
          empty: t("monthEmpty"),
        }}
      />
    </section>
  );
}
