import { z } from "zod";

import { isIsoMonth } from "@/lib/dates";

/**
 * Admin input for departures (docs/specs/phase-2-catalog-admin.md steps 14–16). Messages are keys
 * in `Admin.Departures.errors`. The database repeats the important rules (*_tour_rules.sql for
 * prices, *_departure_rules.sql for capacity, cancelling and the last departure).
 */
export const DEPARTURE_STATUSES = ["open", "guaranteed", "closed", "cancelled"] as const;
export type DepartureStatus = (typeof DEPARTURE_STATUSES)[number];
export const DEPARTURES_PAGE_SIZE = 25;
export const DEPARTURE_SORTS = ["start_date", "capacity", "seats_reserved"] as const;
export const DEPARTURE_VIEWS = ["table", "calendar"] as const;
export type DepartureView = (typeof DEPARTURE_VIEWS)[number];

/** URL filters; `tour` and `month` are checked again by `departureFilters`. */
export const departureListFilters = {
  status: DEPARTURE_STATUSES,
  tour: null,
  month: null,
} as const;

export type DepartureFilters = { status?: DepartureStatus; tourId?: string; month?: string };

/** Drops filter values that are not a status, a tour id or a `YYYY-MM` month. */
export function departureFilters(raw: Record<string, string>): DepartureFilters {
  const out: DepartureFilters = {};
  const status = z.enum(DEPARTURE_STATUSES).safeParse(raw.status);
  if (status.success) out.status = status.data;
  const tour = z.uuid().safeParse(raw.tour);
  if (tour.success) out.tourId = tour.data;
  if (raw.month && isIsoMonth(raw.month)) out.month = raw.month;
  return out;
}

export function departureView(raw: string | string[] | undefined): DepartureView {
  return z
    .enum(DEPARTURE_VIEWS)
    .catch("table")
    .parse(Array.isArray(raw) ? raw[0] : raw);
}
