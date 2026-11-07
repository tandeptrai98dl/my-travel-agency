import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cronFailures: vi.fn(),
  lapsedHolds: vi.fn(),
  claimedKeys: vi.fn(),
  sendEmail: vi.fn(),
  buildContext: vi.fn(),
  captureMessage: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("./monitoring.repository", () => ({ cronFailures: mocks.cronFailures, lapsedHolds: mocks.lapsedHolds }));
vi.mock("./operations.repository", () => ({ claimedKeys: mocks.claimedKeys }));
vi.mock("@/modules/booking/booking-emails.service", () => ({ buildContext: mocks.buildContext }));
vi.mock("@/modules/notification/email.service", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: mocks.captureMessage }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { loadMessages } = await import("@/i18n/messages");
const vi_ = await loadMessages("vi");
const en = await loadMessages("en");
const { runHealthChecks } = await import("./monitoring.service");

const NOW = new Date("2026-11-10T02:00:00Z");
const FAILED = { kind: "failed", job_name: "email-problems-alert", run_at: "2026-11-10T01:45:00.000123+00:00", message: "ERROR: email: 1 stuck in queued" };
const MISSED = { kind: "missed", job_name: "booking-complete", run_at: "2026-11-08T19:15:00+00:00", message: null };
const context = (email: string | null) => ({
  brand: { name: "PTA", email, phone: null },
  siteUrl: new URL("https://example.test"),
  messages: { vi: vi_, en },
  staffEmail: email,
});

/** A stand-in for email_logs: sendEmail claims the key, as the real one does before sending. */
let claimed: Set<string>;

beforeEach(() => {
  vi.clearAllMocks();
  claimed = new Set();
  mocks.cronFailures.mockResolvedValue({ data: [FAILED, MISSED], error: null });
  mocks.lapsedHolds.mockResolvedValue({ count: 0, error: null });
  mocks.claimedKeys.mockImplementation(async (keys: string[]) => ({ data: keys.filter((key) => claimed.has(key)).map((dedupe_key) => ({ dedupe_key })), error: null }));
  mocks.sendEmail.mockImplementation(async (message: { dedupeKey: string }) => {
    if (claimed.has(message.dedupeKey)) return "duplicate";
    claimed.add(message.dedupeKey);
    return "sent";
  });
  mocks.buildContext.mockResolvedValue(context("team@example.test"));
});

describe("runHealthChecks", () => {
  it("emails the team once per failed or missed run, across repeated checks", async () => {
    const first = await runHealthChecks(NOW);
    expect(mocks.cronFailures).toHaveBeenCalledWith("2026-11-09T02:00:00.000Z");
    expect(first.alerts).toEqual({ considered: 2, sent: 2, skipped: 0, failed: 0, duplicate: 0 });
    const sent = mocks.sendEmail.mock.calls.map(([message]) => message as { to: string; subject: string; template: string; dedupeKey: string; text: string });
    expect(sent.map((message) => message.dedupeKey)).toEqual([
      "cron_failure:email-problems-alert:2026-11-10T01:45:00.000Z",
      "cron_missed:booking-complete:2026-11-08T19:15:00.000Z",
    ]);
    expect(sent.every((message) => message.to === "team@example.test" && message.template === "cron_alert")).toBe(true);
    expect(sent.map((message) => message.subject).sort()).toEqual([
      "Tác vụ định kỳ không chạy · booking-complete",
      "Tác vụ định kỳ thất bại · email-problems-alert",
    ]);
    expect(mocks.captureMessage).toHaveBeenCalledTimes(2);
    expect(mocks.captureMessage).toHaveBeenCalledWith("Scheduled job failed: email-problems-alert", {
      level: "error",
      tags: { "cron.job": "email-problems-alert", "cron.kind": "failed" },
      fingerprint: ["cron", "failed", "email-problems-alert"],
    });
    // Sentry never receives the run's message.
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).not.toContain("stuck in queued");

    vi.clearAllMocks();
    const second = await runHealthChecks(new Date(NOW.getTime() + 15 * 60_000));
    expect(second.alerts).toEqual({ considered: 2, sent: 0, skipped: 0, failed: 0, duplicate: 2 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it("without a team address claims nothing, so the alert goes out once the address is set", async () => {
    mocks.buildContext.mockResolvedValue(context(null));
    const without = await runHealthChecks(NOW);
    expect(without.alerts).toEqual({ considered: 2, sent: 0, skipped: 2, failed: 0, duplicate: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(claimed.size).toBe(0);

    mocks.buildContext.mockResolvedValue(context("team@example.test"));
    const later = await runHealthChecks(new Date(NOW.getTime() + 15 * 60_000));
    expect(later.alerts.sent).toBe(2);
    expect(claimed.size).toBe(2);
  });

  it("the email (Vietnamese) shows Vietnam time, the run's message and the runbook", async () => {
    mocks.cronFailures.mockResolvedValue({ data: [FAILED], error: null });
    await runHealthChecks(NOW);
    const { text, html } = mocks.sendEmail.mock.calls[0]![0] as { text: string; html: string };
    expect(text).toContain("Tác vụ email-problems-alert chạy thất bại");
    expect(text).toContain("10/11/2026 08:45 (UTC+7)");
    expect(text).toContain(FAILED.message);
    expect(html).toContain("Runbooks");
  });

  it("refreshes the cached tour cards when held seats lapsed since the last check", async () => {
    mocks.cronFailures.mockResolvedValue({ data: [], error: null });
    expect((await runHealthChecks(NOW)).lapsedHolds).toBe(0);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    mocks.lapsedHolds.mockResolvedValue({ count: 3, error: null });
    expect((await runHealthChecks(NOW)).lapsedHolds).toBe(3);
    expect(mocks.lapsedHolds).toHaveBeenLastCalledWith("2026-11-10T01:40:00.000Z");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("tours", "max");
  });

  it("fails the run (500) when the database cannot be read", async () => {
    mocks.cronFailures.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(runHealthChecks(NOW)).rejects.toThrow("cron failures query failed: 42501");
  });
});
