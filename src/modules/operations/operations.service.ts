import "server-only";

import { z } from "zod";

import { addDays } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { sendBalanceOverdueAlert, sendBalanceReminder, sendMinPaxAlert } from "@/modules/booking/booking-emails.service";

import * as repo from "./operations.repository";
import { type BalanceCandidate, jobDay, MIN_PAX_BUCKETS, planBalanceJobs, planMinPaxAlerts, reminderWindows } from "./schedule";

/**
 * The daily jobs behind `/api/cron/*` (spec Phase 5 decisions 10–12). Idempotent: every email
 * has an exactly-once key in `email_logs` (ADR-036), so a rerun, a retry by Vercel or a call from
 * CI sends nothing twice. Overdue balances are reminded and flagged, never cancelled (ADR-016).
 * Logs and answers carry counts only, never addresses.
 */

export type JobCounts = { considered: number; sent: number; skipped: number; failed: number; duplicate: number };

const PAGE = 500;
const KEY_CHUNK = 200;

function emptyCounts(): JobCounts {
  return { considered: 0, sent: 0, skipped: 0, failed: 0, duplicate: 0 };
}

function count(counts: JobCounts, result: string) {
  if (result === "sent") counts.sent += 1;
  else if (result === "duplicate") counts.duplicate += 1;
  else if (result === "unavailable" || result === "no_address") counts.skipped += 1;
  else counts.failed += 1;
}

async function claimedAmong(keys: string[]): Promise<Set<string>> {
  const claimed = new Set<string>();
  for (let i = 0; i < keys.length; i += KEY_CHUNK) {
    const { data, error } = await repo.claimedKeys(keys.slice(i, i + KEY_CHUNK));
    if (error) throw new Error(`claimed keys query failed: ${error.code ?? "unknown"}`);
    for (const row of data ?? []) if (row.dedupe_key) claimed.add(row.dedupe_key);
  }
  return claimed;
}

export async function runBalanceReminders(now: Date = new Date()): Promise<{ reminders: JobCounts; overdue: JobCounts }> {
  const today = jobDay(now);
  const rules = await repo.bookingRules();
  if (rules.error) throw new Error(`booking rules query failed: ${rules.error.code ?? "unknown"}`);
  const value = rules.data?.value;
  const windows = reminderWindows(value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).balance_reminder_days_before_due : undefined);
  const until = addDays(today, Math.max(...windows));

  const candidates: BalanceCandidate[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await repo.balanceCandidates(until, from, from + PAGE - 1);
    if (error) throw new Error(`balance candidates query failed: ${error.code ?? "unknown"}`);
    for (const row of data ?? []) {
      candidates.push({ id: row.id, status: row.status, total: row.total, amountPaid: row.amount_paid, balanceDueDate: row.balance_due_date });
    }
    if (!data || data.length < PAGE) break;
  }

  const unclaimed = planBalanceJobs(candidates, today, windows, new Set());
  const claimed = await claimedAmong([...unclaimed.reminders.map((r) => r.key), ...unclaimed.overdue.map((o) => o.key)]);
  const plan = planBalanceJobs(candidates, today, windows, claimed);

  const reminders = emptyCounts();
  const overdue = emptyCounts();
  reminders.considered = unclaimed.reminders.length;
  overdue.considered = unclaimed.overdue.length;
  reminders.duplicate = unclaimed.reminders.length - plan.reminders.length;
  overdue.duplicate = unclaimed.overdue.length - plan.overdue.length;
  for (const reminder of plan.reminders) count(reminders, await sendBalanceReminder(reminder.bookingId, reminder.key));
  for (const alert of plan.overdue) count(overdue, await sendBalanceOverdueAlert(alert.bookingId, alert.key));
  logger.info("cron.balance_reminders", { today, reminders: JSON.stringify(reminders), overdue: JSON.stringify(overdue) });
  return { reminders, overdue };
}

const shortDepartures = z.array(
  z.object({
    departure_id: z.string(),
    tour_id: z.string(),
    tour_code: z.string(),
    start_date: z.string(),
    days_left: z.number().int(),
    confirmed: z.number().int(),
    min_pax: z.number().int(),
  }),
);

function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export async function runDepartureChecks(): Promise<{ alerts: JobCounts }> {
  const { data, error } = await repo.departuresBelowMinimum(Math.max(...MIN_PAX_BUCKETS));
  if (error) throw new Error(`departures below minimum query failed: ${error.code ?? "unknown"}`);
  const departures = shortDepartures.parse(data ?? []);
  const unclaimed = planMinPaxAlerts(departures.map((d) => ({ departureId: d.departure_id, daysLeft: d.days_left })), new Set());
  const claimed = await claimedAmong(unclaimed.map((a) => a.key));
  const plan = planMinPaxAlerts(departures.map((d) => ({ departureId: d.departure_id, daysLeft: d.days_left })), claimed);

  const alerts = emptyCounts();
  alerts.considered = unclaimed.length;
  alerts.duplicate = unclaimed.length - plan.length;
  if (plan.length > 0) {
    const byId = new Map(departures.map((d) => [d.departure_id, d]));
    const tourIds = [...new Set(plan.map((a) => byId.get(a.departureId)!.tour_id))];
    const { data: titles } = await repo.tourTitles(tourIds);
    const titleOf = (tourId: string) =>
      titles?.find((row) => row.tour_id === tourId && row.locale === "vi")?.title ?? titles?.find((row) => row.tour_id === tourId)?.title ?? "";
    for (const alert of plan) {
      const departure = byId.get(alert.departureId)!;
      const result = await sendMinPaxAlert(
        departure.departure_id,
        {
          tourCode: departure.tour_code,
          tourTitle: titleOf(departure.tour_id),
          startDate: formatDate(departure.start_date),
          daysLeft: departure.days_left,
          confirmed: departure.confirmed,
          minPax: departure.min_pax,
        },
        alert.key,
      );
      count(alerts, result);
    }
  }
  logger.info("cron.departure_checks", { alerts: JSON.stringify(alerts) });
  return { alerts };
}
