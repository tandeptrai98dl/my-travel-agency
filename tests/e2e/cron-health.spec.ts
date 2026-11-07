import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import { expect, test } from "./support/test";

import { adminApi } from "./support/admin-api";

// Phase 6 PR 6B (docs/specs/phase-6-hardening-launch.md decisions 3 and 4): the health check emails
// the team once per failed pg_cron run (exactly-once key in email_logs), and the housekeeping job
// removes staged uploads older than 24 hours and keeps newer ones. The refusals without the secret
// are in operations.spec.ts with the other cron routes.

test.describe.configure({ mode: "serial" });

const secret = process.env.CRON_SECRET;
const hasPsql = spawnSync("psql", ["--version"]).status === 0;

/** One SQL statement through psql (pg_cron's tables and storage.objects are not exposed over REST). */
function psql(sql: string): string {
  const result = spawnSync("psql", [process.env.E2E_DB_URL!, "-qXtA", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`);
  return result.stdout.trim();
}

test.beforeEach(() => {
  test.skip(!secret || !process.env.E2E_DB_URL || !hasPsql, "needs CRON_SECRET, psql and the local database (CI)");
});

test("health checks: a failed pg_cron run alerts the team once, however often the check runs", async ({ request }) => {
  test.skip(psql("select to_regclass('cron.job_run_details') is not null") !== "t", "needs pg_cron");
  const job = `e2e-failing-${Date.now()}`;
  // A yearly schedule: never judged as missed, and unscheduled again below.
  const started = psql(
    `with j as (select cron.schedule('${job}', '0 0 1 1 *', 'select 1') as id)
     insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
     select j.id, -(floor(random() * 1e9)::bigint + 1), 0, current_database(), current_user, 'select 1', 'failed',
            'ERROR: e2e failure', date_trunc('second', now()) - interval '5 minutes', date_trunc('second', now()) - interval '5 minutes' from j
     returning to_char(start_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
  );
  const key = `cron_failure:${job}:${started}`;
  try {
    const check = async () => {
      const response = await request.get("/api/cron/health-checks", { headers: { Authorization: `Bearer ${secret}` } });
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toContain("no-store");
      const body = (await response.json()) as { ok: boolean; alerts: { considered: number; duplicate: number }; lapsedHolds: number };
      expect(body.ok).toBe(true);
      // Counts only: no job names, messages or addresses in the answer.
      expect(JSON.stringify(body)).not.toContain(job);
      return body;
    };
    await check();
    const rows = async () => (await adminApi().from("email_logs").select("template, to_email, status").eq("dedupe_key", key)).data ?? [];
    expect(await rows()).toEqual([expect.objectContaining({ template: "cron_alert", to_email: "hello@example.com" })]);
    const again = await check();
    expect(again.alerts.duplicate).toBeGreaterThanOrEqual(1);
    expect(await rows()).toHaveLength(1);
  } finally {
    psql(`delete from cron.job_run_details where jobid = (select jobid from cron.job where jobname = '${job}'); select cron.unschedule('${job}');`);
    await adminApi().from("email_logs").delete().eq("dedupe_key", key);
  }
});

test("housekeeping: staged uploads older than 24 hours are removed, newer ones stay", async ({ request }) => {
  const folder = randomUUID();
  const old = `pending/${folder}/${randomUUID()}.jpg`;
  const fresh = `pending/${folder}/${randomUUID()}.jpg`;
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
  const storage = adminApi().storage.from("media-uploads");
  for (const path of [old, fresh]) {
    const { error } = await storage.upload(path, bytes, { contentType: "image/jpeg" });
    expect(error).toBeNull();
  }
  psql(`update storage.objects set created_at = now() - interval '25 hours' where bucket_id = 'media-uploads' and name = '${old}'`);
  try {
    const response = await request.get("/api/cron/housekeeping", { headers: { Authorization: `Bearer ${secret}` } });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { ok: boolean; staged: { folders: number; removed: number; failed: number } };
    expect(body.ok).toBe(true);
    expect(body.staged.removed).toBeGreaterThanOrEqual(1);
    expect(body.staged.failed).toBe(0);
    const { data } = await storage.list(`pending/${folder}`);
    expect((data ?? []).map((entry) => `pending/${folder}/${entry.name}`)).toEqual([fresh]);
  } finally {
    await storage.remove([old, fresh]);
  }
});
