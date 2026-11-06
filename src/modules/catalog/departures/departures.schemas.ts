import { z } from "zod";

import { addMonths, isIsoMonth } from "@/lib/dates";

import { expandPlan } from "./departure-dates";

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

/** Months the filter offers and the calendar steps through: a year back, a year and a half ahead. */
export const MONTHS_BACK = 12;
export const MONTHS_AHEAD = 18;

export function monthWindow(thisMonth: string): string[] {
  return Array.from({ length: MONTHS_BACK + MONTHS_AHEAD + 1 }, (_, i) => addMonths(thisMonth, i - MONTHS_BACK));
}

/** The previous and next month from `month`, or null where the window ends. */
export function monthSteps(month: string, thisMonth: string): { previous: string | null; next: string | null } {
  const window = monthWindow(thisMonth);
  const previous = addMonths(month, -1);
  const next = addMonths(month, 1);
  return {
    previous: previous >= window[0] && previous <= window[window.length - 1] ? previous : null,
    next: next >= window[0] && next <= window[window.length - 1] ? next : null,
  };
}

export function departureView(raw: string | string[] | undefined): DepartureView {
  return z
    .enum(DEPARTURE_VIEWS)
    .catch("table")
    .parse(Array.isArray(raw) ? raw[0] : raw);
}

// Create (step 15) ---------------------------------------------------------------------------------

const money = (required: boolean) =>
  z
    .number(required ? "required" : "wholeNumber")
    .int("wholeNumber")
    .min(0, "outOfRange")
    .max(10_000_000_000, "outOfRange");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .nullish()
    .transform((value) => (value ? value : null));
const count = (min: number, max: number) =>
  z.number("wholeNumber").int("wholeNumber").min(min, "outOfRange").max(max, "outOfRange");

/** Admin-only columns (ADR-016, ADR-024); other roles never send them. */
export const departurePricesSchema = z.object({
  priceAdult: money(true),
  priceChild: money(false).nullable(),
  priceInfant: money(false).nullable(),
  singleSupplement: money(false).nullable(),
});
export type DeparturePrices = z.output<typeof departurePricesSchema>;

/** Statuses a new departure may start with (closing and cancelling come later, on the edit page). */
export const NEW_DEPARTURE_STATUSES = ["open", "guaranteed"] as const;
export const MAX_CAPACITY = 500;

export const departurePlanSchema = z
  .object({
    tourId: z.uuid("required"),
    mode: z.enum(["weekly", "dates"]),
    from: z.string().trim().max(10, "dateInvalid"),
    to: z.string().trim().max(10, "dateInvalid"),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    dates: z.string().max(5000, "tooLong"),
    capacity: count(1, MAX_CAPACITY),
    status: z.enum(NEW_DEPARTURE_STATUSES),
    note: optionalText(500),
    prices: departurePricesSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    // The shape of the dates; the service checks them again against today.
    const result = expandPlan(
      value.mode === "weekly"
        ? { mode: "weekly", from: value.from, to: value.to, weekdays: value.weekdays }
        : { mode: "dates", dates: value.dates },
    );
    if (!result.ok) ctx.addIssue({ code: "custom", path: [result.field], message: result.error });
  });
export type DeparturePlanInput = z.input<typeof departurePlanSchema>;
export type DeparturePlanValues = z.output<typeof departurePlanSchema>;

export const departureTourSchema = z.object({ tourId: z.uuid() });

// Edit (step 16) -----------------------------------------------------------------------------------

/** Seats are not here (ADR-012); prices only from admins (ADR-016); dates stay as created. */
export const departureEditSchema = z.object({
  id: z.uuid(),
  status: z.enum(DEPARTURE_STATUSES),
  capacity: count(1, MAX_CAPACITY),
  note: optionalText(500),
  prices: departurePricesSchema.nullable(),
});
export type DepartureEditInput = z.input<typeof departureEditSchema>;
export type DepartureEditValues = z.output<typeof departureEditSchema>;

export const departureIdSchema = z.object({ id: z.uuid() });
