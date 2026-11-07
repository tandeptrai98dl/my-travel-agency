import { daysBetween, type IsoDate, todayInVietnam } from "@/lib/dates";

/**
 * Selection rules of the daily jobs (spec Phase 5 decisions 10 and 11). Pure functions, so the
 * windows, the catch-up after a missed run and Vietnam dates around midnight UTC are unit-tested.
 * "Today" and every due date are Vietnam dates (`balance_due_date` is a local date).
 */

export const DEFAULT_REMINDER_DAYS = [7, 2] as const;
export const MIN_PAX_BUCKETS = [21, 14, 7] as const;

/**
 * The smallest window N with `daysLeft <= N`, or null when no window applies yet or the date has
 * passed. Picking the smallest makes a missed run catch up the next day (8 days → nothing,
 * 6 days → 7) and skips a larger window once a smaller one applies (1 day → 2, never 7).
 */
export function smallestWindow(daysLeft: number, windows: readonly number[]): number | null {
  if (!Number.isInteger(daysLeft) || daysLeft < 0) return null;
  const applying = windows.filter((n) => Number.isInteger(n) && n >= 0 && daysLeft <= n);
  return applying.length ? Math.min(...applying) : null;
}

/** Reminder windows from `settings.booking_rules`, falling back to 7 and 2 days. */
export function reminderWindows(value: unknown): number[] {
  const days = Array.isArray(value) ? value.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 60) : [];
  return days.length ? [...new Set(days)].sort((a, b) => b - a) : [...DEFAULT_REMINDER_DAYS];
}

export type BalanceCandidate = {
  id: string;
  status: string;
  total: number;
  amountPaid: number;
  balanceDueDate: IsoDate | null;
};

export type BalancePlan = {
  reminders: { bookingId: string; window: number; key: string }[];
  overdue: { bookingId: string; key: string }[];
};

/**
 * Confirmed bookings with a balance get the reminder of the smallest window that applies,
 * keyed `balance_reminder:<booking id>:<N>d`; those past their due date get one team alert,
 * keyed `balance_overdue:<booking id>`. Nothing is cancelled (ADR-016); the attention queue
 * derives the overdue reason itself. Keys already in `email_logs` are left out, so a rerun on
 * the same day sends nothing.
 */
export function planBalanceJobs(bookings: BalanceCandidate[], today: IsoDate, windows: readonly number[], claimed: ReadonlySet<string>): BalancePlan {
  const plan: BalancePlan = { reminders: [], overdue: [] };
  for (const booking of bookings) {
    if (booking.status !== "confirmed" || booking.amountPaid >= booking.total || !booking.balanceDueDate) continue;
    const daysLeft = daysBetween(today, booking.balanceDueDate);
    if (daysLeft < 0) {
      const key = `balance_overdue:${booking.id}`;
      if (!claimed.has(key)) plan.overdue.push({ bookingId: booking.id, key });
      continue;
    }
    const window = smallestWindow(daysLeft, windows);
    if (window === null) continue;
    const key = `balance_reminder:${booking.id}:${window}d`;
    if (!claimed.has(key)) plan.reminders.push({ bookingId: booking.id, window, key });
  }
  return plan;
}

export type ShortDeparture = { departureId: string; daysLeft: number };

/** Minimum-traveller alerts at 21, 14 and 7 days, keyed `min_pax:<departure id>:<bucket>d`. */
export function planMinPaxAlerts(departures: ShortDeparture[], claimed: ReadonlySet<string>) {
  const alerts: { departureId: string; bucket: number; key: string }[] = [];
  for (const departure of departures) {
    const bucket = smallestWindow(departure.daysLeft, MIN_PAX_BUCKETS);
    if (bucket === null) continue;
    const key = `min_pax:${departure.departureId}:${bucket}d`;
    if (!claimed.has(key)) alerts.push({ departureId: departure.departureId, bucket, key });
  }
  return alerts;
}

/** The business day the job runs for. */
export function jobDay(now: Date = new Date()): IsoDate {
  return todayInVietnam(now);
}
