import { connection } from "next/server";

import { runCronJob } from "@/modules/operations/cron";
import { runDepartureChecks } from "@/modules/operations/operations.service";

/**
 * Daily at 01:17 UTC (08:17 in Vietnam, `vercel.json`): a team alert for departures within 21
 * days below their minimum, at 21, 14 and 7 days (spec Phase 5 decision 11). Nothing is cancelled.
 */
export async function GET(request: Request) {
  await connection();
  return runCronJob(request, "departure-checks", () => runDepartureChecks());
}
