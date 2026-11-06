import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isTurnstileConfigured, turnstileSiteKey, verifyTurnstile } from "./turnstile";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchMock.mockReset();
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("turnstile", () => {
  it("needs both keys", () => {
    expect(isTurnstileConfigured()).toBe(true);
    expect(turnstileSiteKey()).toBe("site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(isTurnstileConfigured()).toBe(false);
    expect(turnstileSiteKey()).toBeNull();
  });

  it("verifies the token with the secret and the visitor's IP", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, action: "newsletter" })));
    expect(await verifyTurnstile("token", { action: "newsletter", ip: "203.0.113.7" })).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({ secret: "secret", response: "token", remoteip: "203.0.113.7" });
  });

  it("fails closed: refused tokens, another action, errors and missing values", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] })));
    expect(await verifyTurnstile("token", { action: "newsletter" })).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, action: "login" })));
    expect(await verifyTurnstile("token", { action: "newsletter" })).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await verifyTurnstile("token", { action: "newsletter" })).toBe(false);
    expect(await verifyTurnstile("", { action: "newsletter" })).toBe(false);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyTurnstile("token", { action: "newsletter" })).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
