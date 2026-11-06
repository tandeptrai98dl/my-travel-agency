import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestSubscription: vi.fn(),
  confirmSubscription: vi.fn(),
  rateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  sendEmail: vi.fn(),
  configured: { turnstile: true, redis: true, email: true },
  headers: new Map<string, string>(),
}));

vi.mock("@/lib/env/public", () => ({
  publicEnv: { NEXT_PUBLIC_SITE_URL: "https://example.com", NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co" },
}));
vi.mock("@/lib/site-url", () => ({ siteUrl: new URL("https://example.com") }));
vi.mock("./newsletter.repository", () => ({
  requestSubscription: mocks.requestSubscription,
  confirmSubscription: mocks.confirmSubscription,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, rateLimitKey: (scope: string, id: string) => `rl:${scope}:${id}` }));
vi.mock("@/lib/redis", () => ({ isRedisConfigured: () => mocks.configured.redis }));
vi.mock("@/lib/turnstile", () => ({
  isTurnstileConfigured: () => mocks.configured.turnstile,
  turnstileSiteKey: () => (mocks.configured.turnstile ? "site-key" : null),
  verifyTurnstile: mocks.verifyTurnstile,
}));
vi.mock("@/modules/notification/email.repository", () => ({ insertEmailLog: vi.fn() }));
vi.mock("@/modules/notification/email.service", async (original) => ({
  ...(await original<typeof import("@/modules/notification/email.service")>()),
  isEmailConfigured: () => mocks.configured.email,
  sendEmail: mocks.sendEmail,
}));
vi.mock("@/modules/settings/settings.service", () => ({
  getPublicSettings: async () => ({ company: { name: "Brand & Co" }, contact: null, social: {} }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string, values?: Record<string, string>) =>
    `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`,
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));

import { confirmNewsletter, subscribeToNewsletter } from "./newsletter.actions";
import { confirmationEmail } from "./newsletter.email";
import { confirm, newsletterAvailability, subscribe } from "./newsletter.service";
import { createConfirmToken, hashToken, isTokenFresh } from "./newsletter.token";

const input = { email: "anna@example.com", locale: "en" as const, turnstileToken: "cf-token", ip: "203.0.113.7" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(mocks.configured, { turnstile: true, redis: true, email: true });
  mocks.rateLimit.mockResolvedValue("ok");
  mocks.verifyTurnstile.mockResolvedValue(true);
  mocks.requestSubscription.mockResolvedValue({ data: true, error: null });
  mocks.confirmSubscription.mockResolvedValue({ data: true, error: null });
  mocks.sendEmail.mockResolvedValue("sent");
  mocks.headers.clear();
});

describe("tokens", () => {
  it("stores only a SHA-256 of a token that carries its issue time", () => {
    const now = new Date("2026-11-07T00:00:00Z");
    const { token, hash } = createConfirmToken(now);
    expect(token).toMatch(/^[0-9a-z]+\.[A-Za-z0-9_-]{32}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(isTokenFresh(token, new Date("2026-11-13T23:00:00Z"))).toBe(true);
    expect(isTokenFresh(token, new Date("2026-11-14T00:00:01Z"))).toBe(false);
    expect(isTokenFresh(token, new Date("2026-11-06T23:00:00Z"))).toBe(false);
    expect(isTokenFresh("zzz-not-a-token")).toBe(false);
  });
});

describe("confirmation email", () => {
  it("escapes the brand and links the confirmation page", () => {
    const strings = { subject: "Confirm", greeting: "Hello,", body: "Please confirm.", button: "Confirm", expiry: "7 days.", ignore: "Ignore." };
    const message = confirmationEmail({ brand: "<Brand & Co>", url: "https://example.com/en/newsletter/confirm?token=a.b", strings, locale: "en" });
    expect(message.html).toContain("&lt;Brand &amp; Co&gt;");
    expect(message.html).not.toContain("<Brand");
    expect(message.html).toContain('href="https://example.com/en/newsletter/confirm?token=a.b"');
    expect(message.text).toContain("Confirm: https://example.com/en/newsletter/confirm?token=a.b");
  });
});

describe("subscribe", () => {
  it("is refused, with nothing written, while a service is missing", async () => {
    for (const missing of ["turnstile", "redis", "email"] as const) {
      Object.assign(mocks.configured, { turnstile: true, redis: true, email: true, [missing]: false });
      expect(newsletterAvailability()).toEqual({ enabled: false, siteKey: null });
      expect(await subscribe(input)).toBe("unavailable");
    }
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.requestSubscription).not.toHaveBeenCalled();
  });

  it("rate-limits by IP and by address before verifying", async () => {
    mocks.rateLimit.mockResolvedValueOnce("ok").mockResolvedValueOnce("limited");
    expect(await subscribe(input)).toBe("rateLimited");
    expect(mocks.rateLimit).toHaveBeenCalledWith(["rl:newsletter-ip:203.0.113.7"], 5, 600);
    expect(mocks.rateLimit).toHaveBeenCalledWith(["rl:newsletter-email:anna@example.com"], 3, 86_400);
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    mocks.rateLimit.mockResolvedValue("unavailable");
    expect(await subscribe(input)).toBe("unavailable");
  });

  it("refuses an unverified request", async () => {
    mocks.verifyTurnstile.mockResolvedValue(false);
    expect(await subscribe(input)).toBe("verification");
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith("cf-token", { action: "newsletter", ip: "203.0.113.7" });
    expect(mocks.requestSubscription).not.toHaveBeenCalled();
  });

  it("stores the token hash and emails the link in the visitor's language", async () => {
    expect(await subscribe(input)).toBe("sent");
    const [email, locale, hash] = mocks.requestSubscription.mock.calls[0] as [string, string, string];
    expect([email, locale]).toEqual(["anna@example.com", "en"]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const message = mocks.sendEmail.mock.calls[0][0] as { to: string; template: string; text: string; subject: string };
    expect(message.to).toBe("anna@example.com");
    expect(message.template).toBe("newsletter_confirm");
    expect(message.subject).toContain('"brand":"Brand & Co"');
    const link = /https:\/\/example\.com\/en\/newsletter\/confirm\?token=(\S+)/.exec(message.text);
    expect(link).not.toBeNull();
    expect(hashToken(decodeURIComponent(link![1]))).toBe(hash);
  });

  it("gives an active subscriber the same answer without an email", async () => {
    mocks.requestSubscription.mockResolvedValue({ data: false, error: null });
    expect(await subscribe(input)).toBe("sent");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("reports database and email failures", async () => {
    mocks.sendEmail.mockResolvedValue("failed");
    expect(await subscribe(input)).toBe("failed");
    mocks.requestSubscription.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await subscribe(input)).toBe("failed");
  });
});

describe("confirm", () => {
  it("confirms a fresh token by its hash with the consent version", async () => {
    const { token, hash } = createConfirmToken();
    expect(await confirm({ token, ip: "203.0.113.7", userAgent: "UA" })).toBe("confirmed");
    expect(mocks.confirmSubscription).toHaveBeenCalledWith(hash, "newsletter-2026-11", "203.0.113.7", "UA");
  });

  it("refuses stale, unknown and failing confirmations", async () => {
    const stale = createConfirmToken(new Date(Date.now() - 8 * 86_400_000)).token;
    expect(await confirm({ token: stale, ip: null, userAgent: null })).toBe("invalid");
    expect(mocks.confirmSubscription).not.toHaveBeenCalled();
    mocks.confirmSubscription.mockResolvedValueOnce({ data: false, error: null });
    expect(await confirm({ token: createConfirmToken().token, ip: null, userAgent: null })).toBe("invalid");
    mocks.confirmSubscription.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect(await confirm({ token: createConfirmToken().token, ip: null, userAgent: null })).toBe("unavailable");
  });
});

describe("actions", () => {
  const form = (values: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  };

  it("validates the address before anything else", async () => {
    expect(await subscribeToNewsletter({ status: "idle" }, form({ email: "not-an-email", locale: "vi" }))).toEqual({ status: "invalidEmail" });
    expect(await subscribeToNewsletter({ status: "idle" }, form({ email: "a@b.co", locale: "fr" }))).toEqual({ status: "invalidEmail" });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it("answers a filled honeypot as a success and does nothing", async () => {
    const result = await subscribeToNewsletter({ status: "idle" }, form({ email: "bot@example.com", locale: "vi", website: "spam" }));
    expect(result).toEqual({ status: "sent" });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it("passes the normalised address, the Turnstile token and the forwarded IP", async () => {
    mocks.headers.set("x-forwarded-for", "203.0.113.9, 10.0.0.1");
    const result = await subscribeToNewsletter(
      { status: "idle" },
      form({ email: " Anna@Example.com ", locale: "en", "cf-turnstile-response": "cf-token" }),
    );
    expect(result).toEqual({ status: "sent" });
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith("cf-token", { action: "newsletter", ip: "203.0.113.9" });
    expect(mocks.requestSubscription.mock.calls[0][0]).toBe("anna@example.com");
  });

  it("refuses a malformed confirmation token without a database call", async () => {
    expect(await confirmNewsletter({ status: "idle" }, form({ token: "<script>" }))).toEqual({ status: "invalid" });
    expect(mocks.confirmSubscription).not.toHaveBeenCalled();
  });
});
