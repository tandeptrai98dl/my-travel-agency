import "server-only";

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { cronAuthorization, cronStatus } from "@/lib/cron-auth";
import { serverEnv } from "@/lib/env/server";
import { logger } from "@/lib/logger";

import { CRON_JOBS, type CronJobName, heartbeatUrl } from "./cron-jobs";

/**
 * Runs a job for a `/api/cron/*` route (spec Phase 5 decision 12): 503 without CRON_SECRET,
 * 401 without the right `Authorization: Bearer <CRON_SECRET>`, never cached. The answer holds
 * counts only.
 *
 * Heartbeat (docs/specs/phase-6-hardening-launch.md decision 3): if Vercel Cron stops, nothing
 * here runs and nothing alerts, so every run checks in with Sentry Cron Monitors (ok or error,
 * with the job's schedule; a no-op without a DSN) and, on success, pings `CRON_HEARTBEAT_URL`
 * (the uptime monitor's heartbeat), which alerts when a ping is late. A failed ping is logged and
 * never fails the job.
 */
export async function runCronJob(request: Request, name: CronJobName, job: () => Promise<Record<string, unknown>>): Promise<NextResponse> {
  const headers = { "Cache-Control": "no-store" };
  const auth = cronAuthorization(request.headers.get("authorization"), serverEnv.CRON_SECRET);
  if (auth !== "ok") {
    if (auth === "unconfigured") logger.warn("cron.unconfigured", { job: name });
    return NextResponse.json({ ok: false }, { status: cronStatus(auth), headers });
  }
  const monitor = {
    schedule: { type: "crontab" as const, value: CRON_JOBS[name].schedule },
    timezone: "Etc/UTC",
    checkinMargin: 5,
    maxRuntime: 10,
  };
  const checkInId = Sentry.captureCheckIn({ monitorSlug: `cron-${name}`, status: "in_progress" }, monitor);
  try {
    const result = await job();
    Sentry.captureCheckIn({ checkInId, monitorSlug: `cron-${name}`, status: "ok" }, monitor);
    await pingHeartbeat(name);
    await Sentry.flush(2_000);
    return NextResponse.json({ ok: true, ...result }, { status: 200, headers });
  } catch (caught) {
    logger.error("cron.failed", { job: name, error: caught instanceof Error ? caught.name : "Error" });
    Sentry.captureCheckIn({ checkInId, monitorSlug: `cron-${name}`, status: "error" }, monitor);
    await Sentry.flush(2_000);
    return NextResponse.json({ ok: false }, { status: 500, headers });
  }
}

async function pingHeartbeat(name: CronJobName): Promise<void> {
  const url = heartbeatUrl(serverEnv.CRON_HEARTBEAT_URL, name);
  if (!url) return;
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(3_000) });
    if (!response.ok) logger.warn("cron.heartbeat_failed", { job: name, status: response.status });
  } catch (caught) {
    // Never the URL: it carries the monitor's token.
    logger.warn("cron.heartbeat_failed", { job: name, error: caught instanceof Error ? caught.name : "Error" });
  }
}
