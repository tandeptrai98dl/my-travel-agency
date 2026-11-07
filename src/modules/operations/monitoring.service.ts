import "server-only";

import * as Sentry from "@sentry/nextjs";
import { revalidateTag } from "next/cache";

import { logger } from "@/lib/logger";
import { emailTranslator } from "@/modules/booking/booking-emails";
import { buildContext } from "@/modules/booking/booking-emails.service";
import { TOURS_TAG } from "@/modules/catalog/cache-tags";
import { renderEmail } from "@/modules/notification/render";
import { claimExtraKeys, type SendResult, sendEmail } from "@/modules/notification/email.service";

import { StaffCronEmail } from "../../../emails/staff-cron";

import * as repo from "./monitoring.repository";
import { type CronAlertGroup, cronFailureRows, FAILURE_WINDOW_MS, groupCronAlerts, MAX_LISTED_RUNS, planCronAlerts, vietnamTime } from "./monitoring";
import { claimedAmong, emptyCounts, type JobCounts, tally } from "./operations.service";

/**
 * `/api/cron/health-checks`, every 15 minutes (docs/specs/phase-6-hardening-launch.md decision 3):
 *
 * - every failed pg_cron run of the last day and every overdue job is reported to the team once
 *   (`email_logs.dedupe_key`, ADR-036), in at most one email per job per check, and the job is
 *   reported to Sentry (tag `cron.job`) once per such email;
 * - without a team address (`settings.contact.email`) nothing is claimed, so the alert goes out
 *   on the first check after the address is set (the Phase 5 pattern);
 * - held bookings that lapsed since the last check refresh the cached tour cards (pg_cron's
 *   `expire_holds()` releases seats but cannot refresh the app's cache).
 *
 * The answer and the logs carry counts only.
 */

/** Overlaps the 15-minute schedule, so a late check misses no lapsed hold. */
const LAPSED_WINDOW_MS = 20 * 60_000;

/**
 * One email for one job's group of unreported runs (#54 review). The first key is the email's own
 * exactly-once key; once that is claimed (sent, failed or skipped without Resend), the group's
 * other keys are claimed too, so every run is reported once. Without a team address nothing is
 * claimed.
 */
export async function sendCronAlert(group: CronAlertGroup): Promise<SendResult | "no_address"> {
  try {
    const context = await buildContext();
    if (!context.staffEmail) {
      logger.warn("cron.alert_no_address", { runs: group.keys.length });
      return "no_address";
    }
    const t = emailTranslator("vi", context.messages.vi);
    const listed = group.failed.slice(-MAX_LISTED_RUNS);
    const latest = group.failed.at(-1);
    const element = StaffCronEmail({
      locale: "vi",
      t,
      brand: context.brand,
      alert: {
        job: group.job,
        failedRuns: listed.map((run) => (run.at ? vietnamTime(run.at) : t("staffCron.never"))),
        moreRuns: group.failed.length - listed.length,
        message: latest?.message ?? null,
        missed: group.missed ? { lastSuccess: group.missed.at ? vietnamTime(group.missed.at) : null } : null,
      },
    });
    const kind = group.failed.length > 0 ? "failed" : "missed";
    const subject = t("staffCron.subject", { kind, job: group.job });
    const { html, text } = await renderEmail(element);
    const [first, ...rest] = group.keys;
    const result = await sendEmail({ to: context.staffEmail, subject, html, text, template: "cron_alert", dedupeKey: first });
    if (rest.length > 0) await claimExtraKeys({ to: context.staffEmail, subject, template: "cron_alert" }, rest);
    return result;
  } catch (caught) {
    logger.error("cron.alert_failed", { error: caught instanceof Error ? caught.name : "Error" });
    return "failed";
  }
}

function reportToSentry(group: CronAlertGroup) {
  // Job name and kind only: one Sentry issue per job and kind, never the run's message.
  const kind = group.failed.length > 0 ? "failed" : "missed";
  Sentry.captureMessage(`Scheduled job ${kind}: ${group.job}`, {
    level: "error",
    tags: { "cron.job": group.job, "cron.kind": kind },
    fingerprint: ["cron", kind, group.job],
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
  for (const group of groupCronAlerts(plan)) {
    const result = await sendCronAlert(group);
    tally(alerts, result);
    // Sentry hears of a group only when its email claimed it (sent, failed or skipped without
    // Resend): once per group, never on every check while the team address is missing.
    if (result === "sent" || result === "failed" || result === "unavailable") reportToSentry(group);
  }
  const lapsedHolds = await refreshLapsedHolds(now);
  logger.info("cron.health_checks", { alerts: JSON.stringify(alerts), lapsedHolds });
  return { alerts, lapsedHolds };
}
