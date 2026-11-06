import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const insertEmailLog = vi.hoisted(() => vi.fn());
vi.mock("./email.repository", () => ({ insertEmailLog }));

import { escapeHtml, isEmailConfigured, sendEmail } from "./email.service";

const fetchMock = vi.fn();
const message = { to: "anna@example.com", subject: "Confirm", html: "<p>Hi</p>", text: "Hi", template: "newsletter_confirm" };

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchMock.mockReset();
  insertEmailLog.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Brand <hello@example.com>");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("is unavailable without both Resend variables, and sends nothing", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    expect(isEmailConfigured()).toBe(false);
    expect(await sendEmail(message)).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(insertEmailLog).not.toHaveBeenCalled();
  });

  it("sends through Resend and logs the attempt without the body", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "msg_1" })));
    expect(await sendEmail(message)).toBe("sent");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(String(init.body))).toMatchObject({ from: "Brand <hello@example.com>", to: ["anna@example.com"], subject: "Confirm" });
    expect(insertEmailLog).toHaveBeenCalledWith({
      to_email: "anna@example.com",
      template: "newsletter_confirm",
      subject: "Confirm",
      provider_message_id: "msg_1",
      status: "sent",
      error: null,
    });
  });

  it("logs a failure with the provider's reason", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 }));
    expect(await sendEmail(message)).toBe("failed");
    expect(insertEmailLog.mock.calls[0][0]).toMatchObject({ status: "failed", error: "HTTP 403: domain not verified" });
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await sendEmail(message)).toBe("failed");
  });

  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  });
});
