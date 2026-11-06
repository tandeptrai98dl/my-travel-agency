import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isRedisConfigured, redisPipeline, redisTransaction } from "./redis";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("redisPipeline", () => {
  it("is a no-op without both Upstash variables", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://eu1.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(isRedisConfigured()).toBe(false);
    expect(await redisPipeline([["PING"]])).toEqual({ configured: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one pipeline request with the bearer token", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://eu1.upstash.io/");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ result: 1 }, { result: "OK" }])));
    const result = await redisPipeline([["HSET", "redirects", "/a", "{}"], ["PING"]]);
    expect(result).toEqual({ configured: true, ok: true, results: [1, "OK"] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://eu1.upstash.io/pipeline");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
    expect(JSON.parse(String(init.body))).toEqual([["HSET", "redirects", "/a", "{}"], ["PING"]]);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends transactions to /multi-exec", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://eu1.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ result: "OK" }])));
    await redisTransaction([["RENAME", "a", "b"]]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://eu1.upstash.io/multi-exec");
  });

  it("reports HTTP errors, command errors and network failures without throwing", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://eu1.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    expect(await redisPipeline([["PING"]])).toEqual({ configured: true, ok: false });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ error: "WRONGTYPE" }])));
    expect(await redisPipeline([["PING"]])).toEqual({ configured: true, ok: false });
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await redisPipeline([["PING"]])).toEqual({ configured: true, ok: false });
  });
});
