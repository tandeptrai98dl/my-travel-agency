import { connection } from "next/server";

import { cleanupStagedUploads } from "@/modules/media/staged-cleanup.service";
import { runCronJob } from "@/modules/operations/cron";

/**
 * Daily at 02:29 UTC (09:29 in Vietnam, `vercel.json`; docs/specs/phase-6-hardening-launch.md
 * decision 4): removes staged uploads older than 24 hours through the Storage API. The database
 * housekeeping (tokens, webhook payloads, job history) runs in pg_cron.
 */
export async function GET(request: Request) {
  await connection();
  return runCronJob(request, "housekeeping", async () => ({ staged: await cleanupStagedUploads() }));
}
