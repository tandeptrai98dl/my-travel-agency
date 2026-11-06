import "server-only";

import { requirePermission } from "@/lib/auth/require-role";
import { monthBounds, todayInVietnam } from "@/lib/dates";

import * as repo from "./departures.repository";
import { type DepartureFilters, DEPARTURES_PAGE_SIZE, type DepartureStatus } from "./departures.schemas";

// List and calendar (step 14) ----------------------------------------------------------------------

export type DepartureListItem = {
  id: string;
  tourId: string;
  tourCode: string;
  tourTitle: string;
  startDate: string;
  endDate: string;
  capacity: number;
  seatsReserved: number;
  status: DepartureStatus;
  priceAdult: number;
  note: string | null;
};

type TitledTour = { code: string; tour_translations: { locale: string; title: string }[] } | null;

function tourTitle(tour: TitledTour): string {
  const title = (locale: string) => tour?.tour_translations.find((t) => t.locale === locale)?.title;
  return title("vi") || title("en") || tour?.code || "";
}

function toItem(row: repo.DepartureListRow): DepartureListItem {
  return {
    id: row.id,
    tourId: row.tour_id,
    tourCode: row.tours?.code ?? "",
    tourTitle: tourTitle(row.tours),
    startDate: row.start_date,
    endDate: row.end_date,
    capacity: row.capacity,
    seatsReserved: row.seats_reserved,
    status: row.status,
    priceAdult: row.price_adult,
    note: row.note,
  };
}

/** The date range a filter covers: one month, or (without a month) today onwards. */
export function dateRange(filters: DepartureFilters, today: string): { from: string; to?: string } {
  if (filters.month) {
    const { first, last } = monthBounds(filters.month);
    return { from: first, to: last };
  }
  return { from: today };
}

export async function listDepartures(params: {
  filters: DepartureFilters;
  sort: string;
  dir: "asc" | "desc";
  page: number;
}): Promise<{ items: DepartureListItem[]; total: number; pageCount: number }> {
  await requirePermission("tours.read");
  const from = (params.page - 1) * DEPARTURES_PAGE_SIZE;
  const { data, error, count } = await repo.listDepartureRows({
    status: params.filters.status,
    tourId: params.filters.tourId,
    ...dateRange(params.filters, todayInVietnam()),
    sort: params.sort,
    ascending: params.dir === "asc",
    range: [from, from + DEPARTURES_PAGE_SIZE - 1],
  });
  if (error) throw new Error(`departures query failed: ${error.message}`);
  const items = (data ?? []).map(toItem);
  const total = count ?? items.length;
  return { items, total, pageCount: Math.max(1, Math.ceil(total / DEPARTURES_PAGE_SIZE)) };
}

/** Most departures one month can show; a month with more says so instead of hiding some. */
export const CALENDAR_LIMIT = 400;

/** Every departure starting in one month, grouped by start date (the calendar view). */
export async function departureMonth(
  month: string,
  filters: Omit<DepartureFilters, "month">,
): Promise<{ byDate: Record<string, DepartureListItem[]>; total: number; truncated: boolean }> {
  await requirePermission("tours.read");
  const { first, last } = monthBounds(month);
  const { data, error, count } = await repo.listDepartureRows({
    status: filters.status,
    tourId: filters.tourId,
    from: first,
    to: last,
    sort: "start_date",
    ascending: true,
    range: [0, CALENDAR_LIMIT - 1],
  });
  if (error) throw new Error(`departures query failed: ${error.message}`);
  const byDate: Record<string, DepartureListItem[]> = {};
  for (const item of (data ?? []).map(toItem)) (byDate[item.startDate] ??= []).push(item);
  const total = count ?? 0;
  return { byDate, total, truncated: total > CALENDAR_LIMIT };
}

export type TourOption = {
  id: string;
  code: string;
  title: string;
  type: "group" | "private";
  status: "draft" | "published" | "archived";
  durationDays: number;
  maxPax: number | null;
};

export async function tourOptions(): Promise<TourOption[]> {
  await requirePermission("tours.read");
  const { data, error } = await repo.listTourOptions();
  if (error) throw new Error(`tours query failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    title: tourTitle(row),
    type: row.type,
    status: row.status,
    durationDays: row.duration_days,
    maxPax: row.max_pax,
  }));
}
