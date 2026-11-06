import { addDays, daysBetween, isIsoDate, weekday } from "@/lib/dates";

/**
 * Dates for bulk creation (spec Phase 2 step 15): a weekday pattern within a range, or a list of
 * dates. Pure, so the form, the preview and the save expand a plan the same way.
 */
export const MAX_DEPARTURES_PER_PLAN = 120;
/** Two years: a long sales season, and a guard against a typo in the year. */
export const MAX_PLAN_DAYS = 731;

export type DatePlan =
  | { mode: "weekly"; from: string; to: string; weekdays: number[] }
  | { mode: "dates"; dates: string };

export type PlanError =
  | { error: "required" | "dateInvalid" | "toBeforeFrom" | "rangeTooLong"; field: "from" | "to" }
  | { error: "weekdaysRequired"; field: "weekdays" }
  | { error: "required" | "datesInvalid"; field: "dates"; invalid?: string[] }
  | { error: "noDates" | "tooManyDates"; field: "weekdays" | "dates" }
  | { error: "pastDate"; field: "from" | "dates"; invalid?: string[] };

export type PlanResult = { ok: true; dates: string[] } | ({ ok: false } & PlanError);

const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/** One date as typed: `2026-12-24`, `24/12/2026`, `24-12-2026` or `24.12.2026`. */
export function parseDate(token: string): string | null {
  if (isIsoDate(token)) return token;
  const match = DMY.exec(token);
  if (!match) return null;
  const iso = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

/** A pasted list: one date per line, or separated by commas, semicolons or spaces. */
export function parseDateList(text: string): { dates: string[]; invalid: string[] } {
  const dates = new Set<string>();
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const date = parseDate(token);
    if (date) dates.add(date);
    else invalid.push(token);
  }
  return { dates: [...dates].sort(), invalid };
}

/**
 * The start dates a plan creates, sorted and without repeats. `today` (Vietnam) refuses dates in
 * the past; leave it out to check only the shape (the form, before the server answers).
 */
export function expandPlan(plan: DatePlan, today?: string): PlanResult {
  let dates: string[];
  let field: "weekdays" | "dates";
  if (plan.mode === "weekly") {
    field = "weekdays";
    if (!plan.from) return { ok: false, error: "required", field: "from" };
    if (!isIsoDate(plan.from)) return { ok: false, error: "dateInvalid", field: "from" };
    if (!plan.to) return { ok: false, error: "required", field: "to" };
    if (!isIsoDate(plan.to)) return { ok: false, error: "dateInvalid", field: "to" };
    const span = daysBetween(plan.from, plan.to);
    if (span < 0) return { ok: false, error: "toBeforeFrom", field: "to" };
    if (span > MAX_PLAN_DAYS) return { ok: false, error: "rangeTooLong", field: "to" };
    if (plan.weekdays.length === 0) return { ok: false, error: "weekdaysRequired", field: "weekdays" };
    if (today && plan.from < today) return { ok: false, error: "pastDate", field: "from" };
    const days = new Set(plan.weekdays);
    dates = [];
    for (let day = plan.from; day <= plan.to; day = addDays(day, 1)) {
      if (days.has(weekday(day))) dates.push(day);
      if (dates.length > MAX_DEPARTURES_PER_PLAN) break;
    }
  } else {
    field = "dates";
    if (!plan.dates.trim()) return { ok: false, error: "required", field };
    const parsed = parseDateList(plan.dates);
    if (parsed.invalid.length) return { ok: false, error: "datesInvalid", field, invalid: parsed.invalid.slice(0, 5) };
    dates = parsed.dates;
    const past = today ? dates.filter((date) => date < today) : [];
    if (past.length) return { ok: false, error: "pastDate", field, invalid: past.slice(0, 5) };
  }
  if (dates.length === 0) return { ok: false, error: "noDates", field };
  if (dates.length > MAX_DEPARTURES_PER_PLAN) return { ok: false, error: "tooManyDates", field };
  return { ok: true, dates };
}
