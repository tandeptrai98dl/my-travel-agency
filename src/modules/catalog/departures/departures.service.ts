import "server-only";

import { updateTag } from "next/cache";

import { requirePermission } from "@/lib/auth/require-role";
import { addDays, monthBounds, todayInVietnam } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { TOURS_TAG, tourTag } from "@/modules/catalog/tours/tours.service";

import { expandPlan } from "./departure-dates";
import * as repo from "./departures.repository";
import {
  type DepartureFilters,
  type DeparturePlanValues,
  type DeparturePrices,
  DEPARTURES_PAGE_SIZE,
  type DepartureStatus,
} from "./departures.schemas";

/** Departures show on public tour pages and in the listing, so tour tags are refreshed. */
function refresh(tourId: string) {
  updateTag(TOURS_TAG);
  updateTag(tourTag(tourId));
}

type DbError = { code?: string; message?: string; details?: string } | null;

export type DepartureError =
  | "not_found"
  | "tourNotGroup"
  | "tourArchived"
  | "firstNeedsAdmin"
  | "adminOnly"
  | "pricesRequired"
  | "belowReserved"
  | "cancelAdminOnly"
  | "hasOpenBookings"
  | "lastDeparture"
  | "hasBookings"
  | "pastDate"
  | "noDates"
  | "tooManyDates"
  | "duplicate"
  | "failed";
export type DepartureFailure = { ok: false; error: DepartureError | string; field?: string; invalid?: string[] };

/** Postgres error → form error (constraints, the price guard and *_departure_rules.sql). */
export function mapDepartureError(error: DbError): DepartureFailure {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if (error?.code === "42501") {
    if (text.includes("first departure")) return { ok: false, error: "firstNeedsAdmin", field: "tourId" };
    if (text.includes("cancels or reopens")) return { ok: false, error: "cancelAdminOnly", field: "status" };
    if (text.includes("price")) return { ok: false, error: "adminOnly", field: "prices" };
  }
  if (error?.code === "23514") {
    if (text.includes("reserved seats")) return { ok: false, error: "belowReserved", field: "capacity" };
    if (text.includes("pending or confirmed bookings")) return { ok: false, error: "hasOpenBookings", field: "status" };
    if (text.includes("keeps at least one departure")) return { ok: false, error: "lastDeparture", field: "status" };
  }
  if (error?.code === "23503") return { ok: false, error: "hasBookings" };
  if (error?.code === "23505") return { ok: false, error: "duplicate" };
  logger.error("departures.write_failed", { code: error?.code, message: error?.message });
  return { ok: false, error: "failed" };
}

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

// Create (step 15) ---------------------------------------------------------------------------------

function readPrices(row: {
  price_adult: number;
  price_child: number | null;
  price_infant: number | null;
  single_supplement: number | null;
}): DeparturePrices {
  return {
    priceAdult: row.price_adult,
    priceChild: row.price_child,
    priceInfant: row.price_infant,
    singleSupplement: row.single_supplement,
  };
}

export type CreateDefaults = {
  tour: TourOption;
  /** Prices of the latest departure, or null for a tour without one (an admin creates it). */
  latestPrices: DeparturePrices | null;
};

async function loadTour(tourId: string): Promise<{ ok: true; tour: TourOption } | DepartureFailure> {
  const { data, error } = await repo.findTourForDepartures(tourId);
  if (error) throw new Error(`tour query failed: ${error.message}`);
  if (!data) return { ok: false, error: "not_found", field: "tourId" };
  // Private tours are sold through quotes (ADR-016); archived tours take no new dates.
  if (data.type !== "group") return { ok: false, error: "tourNotGroup", field: "tourId" };
  if (data.status === "archived") return { ok: false, error: "tourArchived", field: "tourId" };
  return {
    ok: true,
    tour: {
      id: data.id,
      code: data.code,
      title: tourTitle(data),
      type: data.type,
      status: data.status,
      durationDays: data.duration_days,
      maxPax: data.max_pax,
    },
  };
}

async function latestPrices(tourId: string): Promise<DeparturePrices | null> {
  const { data, error } = await repo.latestDeparturePrices(tourId);
  if (error) throw new Error(`departure query failed: ${error.message}`);
  return data ? readPrices(data) : null;
}

/** What the create form shows for a tour: its duration, capacity hint and the prices to copy. */
export async function getCreateDefaults(tourId: string): Promise<({ ok: true } & CreateDefaults) | DepartureFailure> {
  await requirePermission("departures.edit");
  const loaded = await loadTour(tourId);
  if (!loaded.ok) return loaded;
  return { ok: true, tour: loaded.tour, latestPrices: await latestPrices(tourId) };
}

export type PlannedDeparture = { startDate: string; endDate: string; exists: boolean };
export type DeparturePreview = {
  ok: true;
  tour: TourOption;
  rows: PlannedDeparture[];
  prices: DeparturePrices;
  /** `latest`: copied from the tour's latest departure (always for non-admins); `entered`: the admin's. */
  priceSource: "latest" | "entered";
};

/** Checks a plan and lists the departures it would create (spec step 15: preview before saving). */
export async function previewDepartures(plan: DeparturePlanValues): Promise<DeparturePreview | DepartureFailure> {
  const user = await requirePermission("departures.edit");
  const loaded = await loadTour(plan.tourId);
  if (!loaded.ok) return loaded;
  const expanded = expandPlan(
    plan.mode === "weekly"
      ? { mode: "weekly", from: plan.from, to: plan.to, weekdays: plan.weekdays }
      : { mode: "dates", dates: plan.dates },
    todayInVietnam(),
  );
  if (!expanded.ok) {
    return { ok: false, error: expanded.error, field: expanded.field, ...("invalid" in expanded ? { invalid: expanded.invalid } : {}) };
  }
  const latest = await latestPrices(plan.tourId);
  let prices: DeparturePrices;
  let priceSource: DeparturePreview["priceSource"];
  if (user.role === "admin" && plan.prices) {
    prices = plan.prices;
    priceSource = "entered";
  } else if (latest) {
    // guard_departure_prices() copies these for non-admins whatever is sent.
    prices = latest;
    priceSource = "latest";
  } else {
    return user.role === "admin"
      ? { ok: false, error: "pricesRequired", field: "prices.priceAdult" }
      : { ok: false, error: "firstNeedsAdmin", field: "tourId" };
  }
  const { data: existing, error } = await repo.existingStartDates(plan.tourId, expanded.dates);
  if (error) throw new Error(`departure query failed: ${error.message}`);
  const taken = new Set((existing ?? []).map((row) => row.start_date));
  const duration = loaded.tour.durationDays;
  return {
    ok: true,
    tour: loaded.tour,
    rows: expanded.dates.map((startDate) => ({
      startDate,
      endDate: addDays(startDate, duration - 1),
      exists: taken.has(startDate),
    })),
    prices,
    priceSource,
  };
}

export type CreateResult = { ok: true; tourId: string; created: string[]; skipped: string[] } | DepartureFailure;

/** Creates the planned departures; dates the tour already has are reported, not failed. */
export async function createDepartures(plan: DeparturePlanValues): Promise<CreateResult> {
  const preview = await previewDepartures(plan);
  if (!preview.ok) return preview;
  const fresh = preview.rows.filter((row) => !row.exists);
  if (fresh.length === 0) {
    return { ok: true, tourId: plan.tourId, created: [], skipped: preview.rows.map((row) => row.startDate) };
  }
  const { data, error } = await repo.insertDepartures(
    fresh.map((row) => ({
      tour_id: plan.tourId,
      start_date: row.startDate,
      end_date: row.endDate,
      capacity: plan.capacity,
      status: plan.status,
      note: plan.note,
      price_adult: preview.prices.priceAdult,
      price_child: preview.prices.priceChild,
      price_infant: preview.prices.priceInfant,
      single_supplement: preview.prices.singleSupplement,
    })),
  );
  if (error) return mapDepartureError(error);
  const created = new Set((data ?? []).map((row) => row.start_date));
  refresh(plan.tourId);
  return {
    ok: true,
    tourId: plan.tourId,
    created: [...created].sort(),
    skipped: preview.rows.map((row) => row.startDate).filter((date) => !created.has(date)),
  };
}
