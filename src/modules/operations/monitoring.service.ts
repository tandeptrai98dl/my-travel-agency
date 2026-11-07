import "server-only";

import * as Sentry from "@sentry/nextjs";
import { revalidateTag } from "next/cache";

import { logger } from "@/lib/logger";
import { emailTranslator } from "@/modules/booking/booking-emails";
import { buildContext } from "@/modules/booking/booking-emails.service";
import { TOURS_TAG } from "@/modules/catalog/cache-tags";
import { renderEmail } from "@/modules/notification/render";
import { type SendResult, sendEmail } from "@/modules/notification/email.service";

import { StaffCronEmail } from "../../../emails/staff-cron";

import * as repo from "./monitoring.repository";
import { type CronAlert, cronFailureRows, FAILURE_WINDOW_MS, planCronAlerts, vietnamTime } from "./monitoring";
import { claimedAmong, emptyCounts, type JobCounts, tally } from "./operations.service";

/**
 * `/api/cron/health-checks`, every 15 minutes (docs/specs/phase-6-hardening-launch.md decision 3):
 *
 * - every failed pg_cron run of the last day and every overdue job is emailed to the team once
 *   (`email_logs.dedupe_key`, ADR-036) and reported to Sentry (tag `cron.job`);
 * - without a team address (`settings.contact.email`) nothing is claimed, so the alert goes out
 *   on the first check after the address is set (the Phase 5 pattern);
 * - held bookings that lapsed since the last check refresh the cached tour cards (pg_cron's
 *   `expire_holds()` releases seats but cannot refresh the app's cache).
 *
 * The answer and the logs carry counts only.
 */

/** Overlaps the 15-minute schedule, so a late check misses no lapsed hold. */
const LAPSED_WINDOW_MS = 20 * 60_000;

export async function sendCronAlert(alert: CronAlert): Promise<SendResult | "no_address"> {
  try {
    const context = await buildContext();
    if (!context.staffEmail) {
      logger.warn("cron.alert_no_address", { kind: alert.kind });
      return "no_address";
    }
    const t = emailTranslator("vi", context.messages.vi);
    const element = StaffCronEmail({
      locale: "vi",
      t,
      brand: context.brand,
      alert: { kind: alert.kind, job: alert.job, at: alert.at ? vietnamTime(alert.at) : null, message: alert.message },
    });
    const { html, text } = await renderEmail(element);
    return await sendEmail({
      to: context.staffEmail,
      subject: t("staffCron.subject", { kind: alert.kind, job: alert.job }),
      html,
      text,
      template: "cron_alert",
      dedupeKey: alert.key,
    });
  } catch (caught) {
    logger.error("cron.alert_failed", { error: caught instanceof Error ? caught.name : "Error" });
    return "failed";
  }
}

function reportToSentry(alert: CronAlert) {
  // Job name and kind only: one Sentry issue per job and kind, never the run's message.
  Sentry.captureMessage(`Scheduled job ${alert.kind}: ${alert.job}`, {
    level: "error",
    tags: { "cron.job": alert.job, "cron.kind": alert.kind },
    fingerprint: ["cron", alert.kind, alert.job],
  });
}

async function refreshLapsedHolds(now: Date): Promise<number> {
  const { count, error } = await repo.lapsedHolds(new Date(now.getTime() - LAPSED_WINDOW_MS).toISOString());
  if (error) throw new Error(`lapsed holds query failed: ${error.code ?? "unknown"}`);
  if (count) revalidateTag(TOURS_TAG, "max");
  return count ?? 0;
}

export async function runHealthChecks(now: Date = new Date()): Promise<{ alerts: JobCounts; lapsedHolds: number }> {
  const { data, error } = await repo.cronFailures(new Date(now.getTime() - FAILURE_WINDOW_MS).toISOString());
  if (error) throw new Error(`cron failures query failed: ${error.code ?? "unknown"}`);
  const rows = cronFailureRows.parse(data ?? []);
  const unclaimed = planCronAlerts(rows, new Set());
  const plan = planCronAlerts(rows, await claimedAmong(unclaimed.map((alert) => alert.key)));

  const alerts = emptyCounts();
  alerts.considered = unclaimed.length;
  alerts.duplicate = unclaimed.length - plan.length;
  for (const alert of plan) {
    const result = await sendCronAlert(alert);
    tally(alerts, result);
    // Reported with the email: once per claimed key; without an address on every check until it is set.
    if (result !== "duplicate") reportToSentry(alert);
  }
  const lapsedHolds = await refreshLapsedHolds(now);
  logger.info("cron.health_checks", { alerts: JSON.stringify(alerts), lapsedHolds });
  return { alerts, lapsedHolds };
}
