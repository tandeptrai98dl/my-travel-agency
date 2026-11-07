import { connection } from "next/server";

import { runCronJob } from "@/modules/operations/cron";
import { runBalanceReminders } from "@/modules/operations/operations.service";

/**
 * Daily at 01:43 UTC (08:43 in Vietnam, `vercel.json`): balance reminders 7 and 2 days before the
 * due date and a one-time team alert for overdue balances (spec Phase 5 decision 10).
 */
export async function GET(request: Request) {
  await connection();
  return runCronJob(request, "balance-reminders", () => runBalanceReminders());
}
