import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { CRON_SECRET: "s".repeat(40) as string | undefined, CRON_HEARTBEAT_URL: "https://hb.example.test/ping/token-{job}" as string | undefined },
  captureCheckIn: vi.fn<(checkIn: { status: string }, monitor?: unknown) => string>(() => "check-in-1"),
  flush: vi.fn(async () => true),
  warn: vi.fn(),
}));
vi.mock("@/lib/env/server", () => ({ serverEnv: mocks.env }));
vi.mock("@sentry/nextjs", () => ({ captureCheckIn: mocks.captureCheckIn, flush: mocks.flush }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: mocks.warn, info: vi.fn() } }));

import { runCronJob } from "./cron";

const authorized = () => new Request("https://example.test/api/cron/health-checks", { headers: { Authorization: `Bearer ${"s".repeat(40)}` } });
const fetchMock = vi.fn(async () => new Response("ok"));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.CRON_SECRET = "s".repeat(40);
  mocks.env.CRON_HEARTBEAT_URL = "https://hb.example.test/ping/token-{job}";
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("runCronJob", () => {
  it("refuses without the secret, and pings nothing", async () => {
    const response = await runCronJob(new Request("https://example.test/api/cron/health-checks"), "health-checks", async () => ({}));
    expect(response.status).toBe(401);
    mocks.env.CRON_SECRET = undefined;
    expect((await runCronJob(authorized(), "health-checks", async () => ({}))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.captureCheckIn).not.toHaveBeenCalled();
  });

  it("on success checks in with Sentry (with the schedule) and pings the job's heartbeat", async () => {
    const response = await runCronJob(authorized(), "health-checks", async () => ({ alerts: 0 }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, alerts: 0 });
    expect(fetchMock).toHaveBeenCalledWith("https://hb.example.test/ping/token-health-checks", expect.objectContaining({ method: "GET", cache: "no-store" }));
    expect(mocks.captureCheckIn.mock.calls.map(([checkIn]) => checkIn.status)).toEqual(["in_progress", "ok"]);
    expect(mocks.captureCheckIn).toHaveBeenLastCalledWith(
      { checkInId: "check-in-1", monitorSlug: "cron-health-checks", status: "ok" },
      expect.objectContaining({ schedule: { type: "crontab", value: "*/15 * * * *" } }),
    );
  });

  it("on failure reports an error check-in and sends no heartbeat, so the monitor alerts", async () => {
    const response = await runCronJob(authorized(), "housekeeping", async () => {
      throw new Error("storage down");
    });
    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.captureCheckIn).toHaveBeenLastCalledWith(
      { checkInId: "check-in-1", monitorSlug: "cron-housekeeping", status: "error" },
      expect.objectContaining({ schedule: { type: "crontab", value: "29 2 * * *" } }),
    );
  });

  it("a failed heartbeat never fails the job and never logs the URL", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const response = await runCronJob(authorized(), "health-checks", async () => ({}));
    expect(response.status).toBe(200);
    expect(mocks.warn).toHaveBeenCalledWith("cron.heartbeat_failed", { job: "health-checks", error: "TypeError" });
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("token");
  });

  it("without a heartbeat URL only Sentry is told", async () => {
    mocks.env.CRON_HEARTBEAT_URL = undefined;
    expect((await runCronJob(authorized(), "health-checks", async () => ({}))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
