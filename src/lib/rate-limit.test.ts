import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimit, rateLimitKey } from "./rate-limit";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockReset();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://eu1.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("rateLimit", () => {
  it("hashes identifiers, so Redis never holds an IP or an email in clear", () => {
    const key = rateLimitKey("newsletter-email", " Anna@Example.com ");
    expect(key).toMatch(/^rl:newsletter-email:[0-9a-f]{32}$/);
    expect(key).toBe(rateLimitKey("newsletter-email", "anna@example.com"));
    expect(key).not.toContain("anna");
  });

  it("counts every key with INCR and starts the window with EXPIRE NX", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ result: 2 }, { result: 0 }])));
    expect(await rateLimit(["rl:a:1"], 5, 600)).toBe("ok");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual([["INCR", "rl:a:1"], ["EXPIRE", "rl:a:1", 600, "NX"]]);
  });

  it("limits once any key is over the limit", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ result: 6 }, { result: 0 }])));
    expect(await rateLimit(["rl:a:1"], 5, 600)).toBe("limited");
  });

  it("fails closed without Redis or when Redis fails", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 500 }));
    expect(await rateLimit(["rl:a:1"], 5, 600)).toBe("unavailable");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(await rateLimit(["rl:a:1"], 5, 600)).toBe("unavailable");
  });
});
