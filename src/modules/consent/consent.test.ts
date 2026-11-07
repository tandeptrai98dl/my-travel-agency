import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertConsent: vi.fn(),
  rateLimit: vi.fn(),
  headers: new Map<string, string>(),
  logs: [] as { event: string; fields: unknown }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./consent.repository", () => ({ insertConsent: mocks.insertConsent }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, rateLimitKey: (scope: string, id: string) => `rl:${scope}:${id}` }));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: (event: string, fields: unknown) => mocks.logs.push({ event, fields }),
    warn: (event: string, fields: unknown) => mocks.logs.push({ event, fields }),
    error: (event: string, fields: unknown) => mocks.logs.push({ event, fields }),
  },
}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (name: string) => mocks.headers.get(name) ?? null }) }));

import { recordConsentChoice } from "./consent.actions";
import { bannerVersion, bannerVersionOf } from "./banner-version";

const ID = "0f8b9c1e-2d3a-4b5c-8d6e-7f8091a2b3c4";
const valid = { id: ID, action: "custom", analytics: true, marketing: false, locale: "en" };

beforeEach(() => {
  mocks.insertConsent.mockReset().mockResolvedValue({ error: null });
  mocks.rateLimit.mockReset().mockResolvedValue("ok");
  mocks.headers.clear();
  mocks.headers.set("x-forwarded-for", "203.0.113.9, 10.0.0.1");
  mocks.logs.length = 0;
});

describe("recordConsentChoice", () => {
  it("records a valid choice with the server's banner version, rate-limited per IP", async () => {
    expect(await recordConsentChoice(valid)).toEqual({ status: "recorded" });
    expect(mocks.rateLimit).toHaveBeenCalledWith(["rl:cookie-consent-ip:203.0.113.9"], 20, 600);
    const [input, version] = mocks.insertConsent.mock.calls[0];
    expect(input).toEqual(valid);
    expect(version).toBe(await bannerVersion("en"));
    expect(version).toMatch(/^banner-en-[0-9a-f]{16}$/);
  });

  it("refuses malformed input without touching the rate limit or the database", async () => {
    for (const input of [
      null,
      "x",
      { ...valid, id: "not-a-uuid" },
      { ...valid, id: ID.toUpperCase() },
      { ...valid, action: "maybe" },
      { ...valid, action: "accept_all" },
      { ...valid, action: "withdraw" },
      { ...valid, locale: "fr" },
      { ...valid, bannerVersion: "banner-en-0000000000000000" },
      { ...valid, analytics: "yes" },
    ]) {
      expect(await recordConsentChoice(input)).toEqual({ status: "invalid" });
    }
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.insertConsent).not.toHaveBeenCalled();
  });

  it("fails closed when the rate limit is unavailable, and stops a flood", async () => {
    mocks.rateLimit.mockResolvedValueOnce("unavailable");
    expect(await recordConsentChoice(valid)).toEqual({ status: "unavailable" });
    mocks.rateLimit.mockResolvedValueOnce("limited");
    expect(await recordConsentChoice(valid)).toEqual({ status: "rateLimited" });
    expect(mocks.insertConsent).not.toHaveBeenCalled();
  });

  it("logs a failed write without the record id or the IP", async () => {
    mocks.insertConsent.mockResolvedValueOnce({ error: { code: "23514", message: `bad row for ${ID}` } });
    expect(await recordConsentChoice(valid)).toEqual({ status: "failed" });
    mocks.insertConsent.mockRejectedValueOnce(new TypeError(`fetch failed ${ID}`));
    expect(await recordConsentChoice(valid)).toEqual({ status: "failed" });
    const logged = JSON.stringify(mocks.logs);
    expect(logged).toContain("consent.record_failed");
    expect(logged).not.toContain(ID);
    expect(logged).not.toContain("203.0.113.9");
  });
});

describe("banner version", () => {
  it("changes exactly when the wording changes", () => {
    const a = bannerVersionOf("vi", { title: "Cookie", body: "Text" });
    expect(bannerVersionOf("vi", { body: "Text", title: "Cookie" })).toBe(a);
    expect(bannerVersionOf("vi", { title: "Cookie", body: "Text." })).not.toBe(a);
    expect(bannerVersionOf("en", { title: "Cookie", body: "Text" })).toMatch(/^banner-en-[0-9a-f]{16}$/);
  });

  it("differs between the two languages", async () => {
    expect(await bannerVersion("vi")).not.toBe((await bannerVersion("en")).replace("banner-en-", "banner-vi-"));
  });
});
