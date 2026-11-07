import { z } from "zod";

/**
 * The health-check plan (docs/specs/phase-6-hardening-launch.md decision 3). `cron_failures()`
 * returns failed pg_cron runs and overdue jobs (the missed-run rule lives in SQL,
 * `cron_job_overdue()`); each row becomes one team alert with an exactly-once key (ADR-036):
 *
 * - a failed run: `cron_failure:<job>:<start>`, so it alerts once, however many checks see it;
 * - a missed job: `cron_missed:<job>:<last success | never>`, so it alerts once per gap, and
 *   again only after the job has succeeded and then stopped again.
 */

export const cronFailureRows = z.array(
  z.object({
    kind: z.enum(["failed", "missed"]),
    job_name: z.string().min(1),
    run_at: z.string().nullable(),
    message: z.string().nullable(),
  }),
);

export type CronFailureRow = z.infer<typeof cronFailureRows>[number];

export type CronAlert = {
  key: string;
  kind: "failed" | "missed";
  job: string;
  /** ISO time of the failed run, or of the missed job's last success (null: never). */
  at: string | null;
  message: string | null;
};

/** The failure window: a day, so a check that could not run for hours still sees what failed. */
export const FAILURE_WINDOW_MS = 24 * 3_600_000;

/** Keys stay short and stable: the job name as pg_cron has it, the time normalised to ISO. */
export function cronAlertKey(row: Pick<CronFailureRow, "kind" | "job_name" | "run_at">): string {
  const at = row.run_at ? new Date(row.run_at).toISOString() : "never";
  return `${row.kind === "failed" ? "cron_failure" : "cron_missed"}:${row.job_name.slice(0, 100)}:${at}`;
}

/** One alert per row whose key is not claimed yet; repeated rows collapse to one. */
export function planCronAlerts(rows: CronFailureRow[], claimed: ReadonlySet<string>): CronAlert[] {
  const seen = new Set<string>();
  const alerts: CronAlert[] = [];
  for (const row of rows) {
    const key = cronAlertKey(row);
    if (claimed.has(key) || seen.has(key)) continue;
    seen.add(key);
    alerts.push({ key, kind: row.kind, job: row.job_name, at: row.run_at ? new Date(row.run_at).toISOString() : null, message: row.message });
  }
  return alerts;
}

const VIETNAM_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "10/11/2026 08:43 (UTC+7)": staff read Vietnam time (DATABASE.md conventions). */
export function vietnamTime(iso: string): string {
  return `${VIETNAM_TIME.format(new Date(iso)).replace(", ", " ")} (UTC+7)`;
}
