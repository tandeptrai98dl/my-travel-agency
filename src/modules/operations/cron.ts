import "server-only";

import { NextResponse } from "next/server";

import { cronAuthorization, cronStatus } from "@/lib/cron-auth";
import { serverEnv } from "@/lib/env/server";
import { logger } from "@/lib/logger";

/**
 * Runs a daily job for a `/api/cron/*` route (spec Phase 5 decision 12): 503 without CRON_SECRET,
 * 401 without the right `Authorization: Bearer <CRON_SECRET>`, never cached. The answer holds
 * counts only.
 */
export async function runCronJob(request: Request, name: string, job: () => Promise<Record<string, unknown>>): Promise<NextResponse> {
  const headers = { "Cache-Control": "no-store" };
  const auth = cronAuthorization(request.headers.get("authorization"), serverEnv.CRON_SECRET);
  if (auth !== "ok") {
    if (auth === "unconfigured") logger.warn("cron.unconfigured", { job: name });
    return NextResponse.json({ ok: false }, { status: cronStatus(auth), headers });
  }
  try {
    return NextResponse.json({ ok: true, ...(await job()) }, { status: 200, headers });
  } catch (caught) {
    logger.error("cron.failed", { job: name, error: caught instanceof Error ? caught.name : "Error" });
    return NextResponse.json({ ok: false }, { status: 500, headers });
  }
}
