import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  isRedisConfigured: vi.fn(() => true),
  redisPipeline: vi.fn(),
  redisTransaction: vi.fn(),
}));
const repo = vi.hoisted(() => {
  const empty = vi.fn(async () => ({ data: [], error: null }));
  return {
    listTourSlugs: vi.fn(async () => ({
      data: [
        { id: "t1", locale: "vi", slug: "du-thuyen" },
        { id: "t1", locale: "en", slug: "cruise" },
      ],
      error: null,
    })),
    listDestinationSlugs: empty,
    listTravelStyleSlugs: empty,
    listPostSlugs: empty,
    listTopicSlugs: empty,
    listPolicySlugs: empty,
  };
});
vi.mock("@/lib/redis", () => redis);
vi.mock("./language-redirects.repository", () => repo);
vi.mock("next/server", () => ({ after: vi.fn() }));

import { rebuildLanguageRedirects, SWAP_IF_NEWEST } from "./language-redirects.service";

beforeEach(() => {
  redis.redisPipeline.mockReset().mockResolvedValue({ configured: true, ok: true, results: [7] });
  redis.redisTransaction.mockReset().mockResolvedValue({ configured: true, ok: true, results: [0, 2, 1, 1] });
});

describe("rebuildLanguageRedirects", () => {
  it("claims a generation, stages its own hash and swaps it in only if it is still the newest", async () => {
    await expect(rebuildLanguageRedirects()).resolves.toEqual({ synced: true, count: 2 });
    expect(redis.redisPipeline).toHaveBeenCalledWith([["INCR", "redirects:languages:generation"]]);
    const commands = redis.redisTransaction.mock.calls[0][0] as (string | number)[][];
    expect(commands[0]).toEqual(["DEL", "redirects:languages:rebuild:7"]);
    expect(commands[1].slice(0, 2)).toEqual(["HSET", "redirects:languages:rebuild:7"]);
    expect(commands[2]).toEqual(["EXPIRE", "redirects:languages:rebuild:7", 60]);
    expect(commands[3]).toEqual(["EVAL", SWAP_IF_NEWEST, 3, "redirects:languages:rebuild:7", "redirects:languages", "redirects:languages:generation", "7"]);
    expect(commands.some((command) => command[0] === "RENAME")).toBe(false);
  });

  it("reads the database only after claiming the generation", async () => {
    await rebuildLanguageRedirects();
    expect(redis.redisPipeline.mock.invocationCallOrder[0]).toBeLessThan(repo.listTourSlugs.mock.invocationCallOrder.at(-1)!);
  });

  it("is still a success when a newer rebuild took over", async () => {
    redis.redisTransaction.mockResolvedValue({ configured: true, ok: true, results: [0, 2, 1, 0] });
    await expect(rebuildLanguageRedirects()).resolves.toEqual({ synced: true, count: 2 });
  });

  it("does nothing more when the generation cannot be claimed", async () => {
    redis.redisPipeline.mockResolvedValue({ configured: true, ok: false });
    await expect(rebuildLanguageRedirects()).resolves.toEqual({ synced: false, count: 0 });
    expect(redis.redisTransaction).not.toHaveBeenCalled();
  });
});
