import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CRON_JOBS, heartbeatUrl } from "./cron-jobs";
import { cronAlertKey, cronFailureRows, planCronAlerts, vietnamTime } from "./monitoring";

const failed = (job: string, at: string, message = "ERROR: email: 1 stuck in queued") => ({ kind: "failed" as const, job_name: job, run_at: at, message });
const missed = (job: string, at: string | null) => ({ kind: "missed" as const, job_name: job, run_at: at, message: null });

describe("cron alert keys", () => {
  it("names the kind, the job and the run, normalised to ISO", () => {
    expect(cronAlertKey(failed("email-problems-alert", "2026-11-10T01:45:00.123456+00:00"))).toBe(
      "cron_failure:email-problems-alert:2026-11-10T01:45:00.123Z",
    );
    expect(cronAlertKey(missed("booking-complete", "2026-11-08T19:15:00+00:00"))).toBe("cron_missed:booking-complete:2026-11-08T19:15:00.000Z");
    expect(cronAlertKey(missed("booking-complete", null))).toBe("cron_missed:booking-complete:never");
  });
});

describe("planCronAlerts", () => {
  it("alerts once per failed run: a run already claimed by an earlier check is not sent again", () => {
    const rows = [failed("email-problems-alert", "2026-11-10T01:45:00Z"), failed("email-problems-alert", "2026-11-10T02:00:00Z")];
    const first = planCronAlerts(rows, new Set());
    expect(first.map((alert) => alert.key)).toEqual([
      "cron_failure:email-problems-alert:2026-11-10T01:45:00.000Z",
      "cron_failure:email-problems-alert:2026-11-10T02:00:00.000Z",
    ]);
    // The next check sees the same two rows plus a new failure: only the new one is planned.
    const next = planCronAlerts([...rows, failed("email-problems-alert", "2026-11-10T02:15:00Z")], new Set(first.map((alert) => alert.key)));
    expect(next.map((alert) => alert.at)).toEqual(["2026-11-10T02:15:00.000Z"]);
  });

  it("alerts once per gap for a missed job, and again only after a new success", () => {
    const gap = planCronAlerts([missed("booking-complete", "2026-11-08T19:15:00Z")], new Set());
    expect(gap).toHaveLength(1);
    const claimed = new Set(gap.map((alert) => alert.key));
    // Still overdue at the next check with the same last success: nothing new.
    expect(planCronAlerts([missed("booking-complete", "2026-11-08T19:15:00Z")], claimed)).toEqual([]);
    // It ran on the 9th and then stopped again: a new gap, a new alert.
    expect(planCronAlerts([missed("booking-complete", "2026-11-09T19:15:00Z")], claimed).map((alert) => alert.key)).toEqual([
      "cron_missed:booking-complete:2026-11-09T19:15:00.000Z",
    ]);
  });

  it("collapses repeated rows and keeps the message of failed runs", () => {
    const plan = planCronAlerts([failed("a", "2026-11-10T01:00:00Z", "boom"), failed("a", "2026-11-10T01:00:00Z", "boom"), missed("b", null)], new Set());
    expect(plan).toEqual([
      { key: "cron_failure:a:2026-11-10T01:00:00.000Z", kind: "failed", job: "a", at: "2026-11-10T01:00:00.000Z", message: "boom" },
      { key: "cron_missed:b:never", kind: "missed", job: "b", at: null, message: null },
    ]);
  });

  it("parses what cron_failures() returns and refuses unknown kinds", () => {
    expect(cronFailureRows.parse([{ kind: "missed", job_name: "x", run_at: null, message: null }])).toHaveLength(1);
    expect(cronFailureRows.safeParse([{ kind: "late", job_name: "x", run_at: null, message: null }]).success).toBe(false);
  });
});

describe("vietnamTime", () => {
  it("shows Vietnam time for staff", () => {
    expect(vietnamTime("2026-11-10T01:43:00Z")).toBe("10/11/2026 08:43 (UTC+7)");
    expect(vietnamTime("2026-11-10T17:05:00Z")).toBe("11/11/2026 00:05 (UTC+7)");
  });
});

describe("cron jobs", () => {
  it("match vercel.json exactly (paths and schedules)", () => {
    const vercel = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };
    const sort = (list: { path: string; schedule: string }[]) => [...list].sort((a, b) => a.path.localeCompare(b.path));
    expect(sort(vercel.crons)).toEqual(sort(Object.values(CRON_JOBS).map(({ path, schedule }) => ({ path, schedule }))));
  });

  it("builds a heartbeat URL per job, or one for all", () => {
    expect(heartbeatUrl(undefined, "housekeeping")).toBeNull();
    expect(heartbeatUrl("https://hb.example.test/ping/abc-{job}", "health-checks")).toBe("https://hb.example.test/ping/abc-health-checks");
    expect(heartbeatUrl("https://hb.example.test/ping/abc", "housekeeping")).toBe("https://hb.example.test/ping/abc");
  });
});
