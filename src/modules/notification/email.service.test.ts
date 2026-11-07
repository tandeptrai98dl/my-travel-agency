import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ insertEmailLog: vi.fn(), updateEmailLog: vi.fn(), claimedKeysForBooking: vi.fn() }));
vi.mock("./email.repository", () => repo);

import { claimExtraKeys, escapeHtml, isEmailConfigured, sendEmail, sendError } from "./email.service";

const fetchMock = vi.fn();
const message = { to: "anna@example.com", subject: "Confirm", html: "<p>Hi</p>", text: "Hi", template: "newsletter_confirm" };
const logs = () => [...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls].map((call) => String(call[0])).join("\n");

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchMock.mockReset();
  repo.insertEmailLog.mockReset().mockResolvedValue({ data: { id: "log-1" }, error: null });
  repo.updateEmailLog.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Brand <hello@example.com>");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("without both Resend variables sends nothing and logs a skipped row (decision 14)", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    expect(isEmailConfigured()).toBe(false);
    expect(await sendEmail({ ...message, bookingId: "b-1", dedupeKey: "k-1" })).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repo.insertEmailLog).toHaveBeenCalledWith({
      to_email: "anna@example.com",
      template: "newsletter_confirm",
      subject: "Confirm",
      booking_id: "b-1",
      inquiry_id: null,
      dedupe_key: "k-1",
      status: "skipped",
    });
    expect(repo.updateEmailLog).not.toHaveBeenCalled();
  });

  it("claims the row before sending, then records the outcome without the body", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "msg_1" })));
    expect(await sendEmail(message)).toBe("sent");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(String(init.body))).toMatchObject({ from: "Brand <hello@example.com>", to: ["anna@example.com"], subject: "Confirm" });
    expect(repo.insertEmailLog.mock.calls[0][0]).toMatchObject({ status: "queued", dedupe_key: null });
    expect(repo.insertEmailLog.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(repo.updateEmailLog).toHaveBeenCalledWith("log-1", { status: "sent", provider_message_id: "msg_1", error: null });
    expect(JSON.stringify(repo.insertEmailLog.mock.calls)).not.toContain("<p>Hi</p>");
  });

  it("sends a keyed email once: a claimed key returns duplicate and sends nothing", async () => {
    repo.insertEmailLog.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } });
    expect(await sendEmail({ ...message, dedupeKey: "booking_confirmed:e-1" })).toBe("duplicate");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendEmail({ ...message, dedupeKey: "booking_confirmed:e-1" })).toBe("duplicate");
  });

  it("does not send a keyed email whose row cannot be written; an unkeyed one still goes out", async () => {
    repo.insertEmailLog.mockResolvedValue({ data: null, error: { code: "08006", message: "connection failure" } });
    expect(await sendEmail({ ...message, dedupeKey: "k" })).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "msg_2" })));
    expect(await sendEmail(message)).toBe("sent");
    expect(repo.updateEmailLog).not.toHaveBeenCalled();
  });

  it("records only the HTTP status or the error class, never the provider's text", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "anna@example.com is not allowed" }), { status: 403 }));
    expect(await sendEmail(message)).toBe("failed");
    expect(repo.updateEmailLog.mock.calls[0][1]).toEqual({ status: "failed", provider_message_id: null, error: "HTTP 403" });
    fetchMock.mockRejectedValue(new TypeError("fetch failed for anna@example.com"));
    expect(await sendEmail(message)).toBe("failed");
    expect(repo.updateEmailLog.mock.calls[1][1]).toMatchObject({ error: "TypeError" });
    expect(JSON.stringify(repo.updateEmailLog.mock.calls)).not.toContain("anna@");
    expect(logs()).not.toContain("anna@");
  });

  it("names only plain error classes", () => {
    expect(sendError({ status: 500 })).toBe("HTTP 500");
    expect(sendError({ caught: new DOMException("timed out", "TimeoutError") })).toBe("TimeoutError");
    expect(sendError({ caught: "boom" })).toBe("Error");
    const odd = new Error("x");
    odd.name = "Error: anna@example.com";
    expect(sendError({ caught: odd })).toBe("Error");
  });

  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  });
});

describe("claimExtraKeys", () => {
  it("writes one skipped row per key, leaves keys already held alone and sends nothing", async () => {
    repo.insertEmailLog
      .mockResolvedValueOnce({ data: { id: "a" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "23505" } })
      .mockResolvedValueOnce({ data: null, error: { code: "08006" } });
    expect(await claimExtraKeys({ to: "team@example.com", subject: "S", template: "cron_alert" }, ["k-2", "k-3", "k-4"])).toBe(1);
    expect(repo.insertEmailLog.mock.calls.map(([row]) => row)).toEqual(
      ["k-2", "k-3", "k-4"].map((key) => ({ to_email: "team@example.com", template: "cron_alert", subject: "S", dedupe_key: key, status: "skipped", error: "grouped" })),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
