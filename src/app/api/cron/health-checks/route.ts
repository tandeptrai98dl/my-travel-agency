import { connection } from "next/server";

import { runCronJob } from "@/modules/operations/cron";
import { runHealthChecks } from "@/modules/operations/monitoring.service";

/**
 * Every 15 minutes (`vercel.json`, docs/specs/phase-6-hardening-launch.md decision 3): emails the
 * team once per failed or missed pg_cron run, reports it to Sentry, and refreshes cached tour cards
 * after held seats lapsed. Its heartbeat shows that Vercel Cron itself still runs.
 */
export async function GET(request: Request) {
  await connection();
  return runCronJob(request, "health-checks", () => runHealthChecks());
}
