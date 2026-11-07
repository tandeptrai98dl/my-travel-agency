/**
 * The Vercel Cron jobs and their schedules (UTC), as in `vercel.json` (a unit test keeps the two
 * equal). The schedule also configures each job's Sentry Cron Monitor, which alerts when a
 * heartbeat is late (docs/specs/phase-6-hardening-launch.md decision 3).
 */
export const CRON_JOBS = {
  "health-checks": { path: "/api/cron/health-checks", schedule: "*/15 * * * *" },
  "departure-checks": { path: "/api/cron/departure-checks", schedule: "17 1 * * *" },
  "balance-reminders": { path: "/api/cron/balance-reminders", schedule: "43 1 * * *" },
  housekeeping: { path: "/api/cron/housekeeping", schedule: "29 2 * * *" },
} as const;

export type CronJobName = keyof typeof CRON_JOBS;

/**
 * The heartbeat URL for one job: `CRON_HEARTBEAT_URL` with `{job}` replaced by the job name (one
 * monitor per job), or the URL as it is (one monitor for every job, which the 15-minute health
 * check keeps pinging).
 */
export function heartbeatUrl(template: string | undefined, job: CronJobName): string | null {
  if (!template) return null;
  return template.replaceAll("{job}", encodeURIComponent(job));
}
