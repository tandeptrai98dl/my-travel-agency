/**
 * Calendar dates as ISO strings (`YYYY-MM-DD`), the shape Postgres `date` columns take over
 * PostgREST. Arithmetic runs in UTC on the date alone, so no time zone shifts a day. "Today" is
 * the business day in Vietnam (DATABASE.md: displayed in Asia/Ho_Chi_Minh).
 */
export type IsoDate = string;
/** `YYYY-MM`. */
export type IsoMonth = string;

export const BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_MS = 86_400_000;

function toUtc(date: IsoDate): number {
  const match = ISO_DATE.exec(date);
  if (!match) throw new RangeError(`not an ISO date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A real calendar date in `YYYY-MM-DD` form (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  return year >= 2000 && year <= 2200 && fromUtc(Date.UTC(year, Number(match[2]) - 1, Number(match[3]))) === value;
}

export function isIsoMonth(value: string): boolean {
  return ISO_MONTH.test(value);
}

/** Today's date in Vietnam. */
export function todayInVietnam(now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday, as `Date.getUTCDay()`. */
export function weekday(date: IsoDate): number {
  return new Date(toUtc(date)).getUTCDay();
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

/** First and last day of a month. */
export function monthBounds(month: IsoMonth): { first: IsoDate; last: IsoDate } {
  const match = ISO_MONTH.exec(month);
  if (!match) throw new RangeError(`not an ISO month: ${month}`);
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return { first: fromUtc(Date.UTC(year, index, 1)), last: fromUtc(Date.UTC(year, index + 1, 0)) };
}

export function addMonths(month: IsoMonth, count: number): IsoMonth {
  const { first } = monthBounds(month);
  const date = new Date(toUtc(first));
  return fromUtc(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1)).slice(0, 7);
}

/**
 * The weeks shown for a month, Monday first (the Vietnamese calendar convention); days outside
 * the month are `null`.
 */
export function monthWeeks(month: IsoMonth): (IsoDate | null)[][] {
  const { first, last } = monthBounds(month);
  const lead = (weekday(first) + 6) % 7;
  const days: (IsoDate | null)[] = Array.from({ length: lead }, () => null);
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  while (days.length % 7 !== 0) days.push(null);
  const weeks: (IsoDate | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

const dateFormatters = {
  vi: new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
};

/** A calendar date for customers: "21/11/2026" (vi) or "21 Nov 2026" (en). */
export function formatDate(date: IsoDate, locale: "vi" | "en"): string {
  return dateFormatters[locale].format(new Date(toUtc(date)));
}

/** "21/11 – 23/11/2026" (vi) or "21 – 23 Nov 2026" (en); the year once when both share it. */
export function formatDateRange(from: IsoDate, to: IsoDate, locale: "vi" | "en"): string {
  if (from === to) return formatDate(from, locale);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  if (!sameYear) return `${formatDate(from, locale)} – ${formatDate(to, locale)}`;
  if (locale === "vi") {
    return `${from.slice(8, 10)}/${from.slice(5, 7)} – ${formatDate(to, locale)}`;
  }
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const short = new Intl.DateTimeFormat("en-GB", sameMonth ? { day: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
  return `${short.format(new Date(toUtc(from)))} – ${formatDate(to, locale)}`;
}

/** "Tháng 12/2026" (vi) or "December 2026" (en), built by hand so it never depends on ICU data. */
export function formatMonth(month: IsoMonth, locale: "vi" | "en"): string {
  const { first } = monthBounds(month);
  const [year, index] = [first.slice(0, 4), Number(first.slice(5, 7))];
  if (locale === "vi") return `Tháng ${index}/${year}`;
  return `${new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(toUtc(first)))} ${year}`;
}

/** The current month in Vietnam and the following ones, `count` in all. */
export function upcomingMonths(count: number, now: Date = new Date()): IsoMonth[] {
  const start = monthOf(todayInVietnam(now));
  return Array.from({ length: count }, (_, index) => addMonths(start, index));
}
