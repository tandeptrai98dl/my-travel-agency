import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
const repo = vi.hoisted(() => {
  const ok = (data: unknown = null) => vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data, error: null }));
  return {
    listRedirectRows: ok([]),
    allRedirectRows: ok([]),
    redirectsTo: ok([]),
    createRedirect: ok("r-new"),
    deleteRedirectRow: ok([{ from_path: "/cu" }]),
  };
});
const redis = vi.hoisted(() => ({
  configured: false,
  isRedisConfigured: vi.fn(),
  redisPipeline: vi.fn(async () => ({ configured: true, ok: true, results: [] })),
  redisTransaction: vi.fn(async () => ({ configured: true, ok: true, results: [] })),
}));
vi.mock("./redirects.repository", () => repo);
vi.mock("@/lib/redis", () => ({
  isRedisConfigured: redis.isRedisConfigured,
  redisPipeline: redis.redisPipeline,
  redisTransaction: redis.redisTransaction,
}));
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: vi.fn(async () => ({ id: "u1", role: "editor" })) }));
vi.mock("./language-redirects.service", () => ({ rebuildLanguageRedirects: vi.fn(async () => ({ synced: true, count: 0 })), scheduleLanguageRedirects: vi.fn() }));

const { requirePermission } = await import("@/lib/auth/require-role");
const service = await import("./redirects.service");
const { normalizePath, redirectSchema } = await import("./redirects.schemas");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  redis.configured = false;
  redis.isRedisConfigured.mockImplementation(() => redis.configured);
});
afterEach(() => vi.restoreAllMocks());

describe("redirect input", () => {
  it("normalizes paths and refuses unsafe or looping ones", () => {
    expect(normalizePath(" khuyen-mai/ ")).toBe("/khuyen-mai");
    expect(normalizePath("/")).toBe("/");
    const issues = (fromPath: string, toPath: string) =>
      redirectSchema.safeParse({ fromPath, toPath, statusCode: 301 }).error?.issues.map((i) => `${String(i.path[0])}:${i.message}`) ?? [];
    expect(issues("/cu", "/moi")).toEqual([]);
    expect(issues("//evil.example", "/moi")).toEqual(["fromPath:pathInvalid"]);
    expect(issues("/cu?x=1", "/moi")).toEqual(["fromPath:pathInvalid"]);
    expect(issues("/cu", "https://evil.example")).toEqual(["toPath:pathInvalid"]);
    expect(issues("/cu", "/cu/")).toEqual(["toPath:redirectToItself"]);
    expect(issues("/", "/moi")).toEqual(["fromPath:pathInvalid"]);
    expect(redirectSchema.safeParse({ fromPath: "/a", toPath: "/b", statusCode: 200 }).success).toBe(false);
  });
});

describe("createRedirect", () => {
  it("maps the function's refusals to their fields", async () => {
    repo.createRedirect.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "this path already has a redirect" } });
    expect(await service.createRedirect({ fromPath: "/cu", toPath: "/moi", statusCode: 301 })).toEqual({ ok: false, error: "fromTaken", field: "fromPath" });
    repo.createRedirect.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "the target is itself redirected" } });
    expect(await service.createRedirect({ fromPath: "/khac", toPath: "/cu", statusCode: 301 })).toEqual({
      ok: false,
      error: "targetRedirected",
      field: "toPath",
    });
  });

  it("saves through one database function; Redis is skipped when not configured", async () => {
    expect(await service.createRedirect({ fromPath: "/cu", toPath: "/moi", statusCode: 301 })).toEqual({ ok: true, id: "r-new", synced: false });
    expect(requirePermission).toHaveBeenCalledWith("redirects.manage");
    expect(repo.createRedirect).toHaveBeenCalledWith({ from_path: "/cu", to_path: "/moi", status_code: 301 });
    expect(redis.redisPipeline).not.toHaveBeenCalled();
  });

  it("writes the new and the flattened redirects to the Redis hash", async () => {
    redis.configured = true;
    repo.redirectsTo.mockResolvedValueOnce({
      data: [
        { from_path: "/cu", to_path: "/moi", status_code: 302 },
        { from_path: "/rat-cu", to_path: "/moi", status_code: 301 },
      ],
      error: null,
    });
    await service.createRedirect({ fromPath: "/cu", toPath: "/moi", statusCode: 302 });
    expect(redis.redisPipeline).toHaveBeenCalledWith([
      ["HSET", "redirects", "/cu", '{"to":"/moi","status":302}', "/rat-cu", '{"to":"/moi","status":301}'],
    ]);
  });
});

describe("delete, resync and slug changes", () => {
  it("removes a deleted redirect from Redis", async () => {
    redis.configured = true;
    expect(await service.deleteRedirect("0f8fad5b-d9cb-469f-a165-70867728950e")).toEqual({ ok: true, synced: true });
    expect(redis.redisPipeline).toHaveBeenCalledWith([["HDEL", "redirects", "/cu"]]);
  });

  it("rebuilds the hash in a staging key and swaps it in", async () => {
    redis.configured = true;
    repo.allRedirectRows.mockResolvedValueOnce({ data: [{ from_path: "/a", to_path: "/b", status_code: 301 }], error: null });
    expect(await service.resyncRedirects()).toEqual({ ok: true, count: 1, synced: true });
    expect(redis.redisTransaction).toHaveBeenCalledWith([
      ["DEL", "redirects:resync"],
      ["HSET", "redirects:resync", "/a", '{"to":"/b","status":301}'],
      ["RENAME", "redirects:resync", "redirects"],
    ]);
  });

  it("reports the count without Redis, and clears the hash when the table is empty", async () => {
    repo.allRedirectRows.mockResolvedValueOnce({ data: [{ from_path: "/a", to_path: "/b", status_code: 301 }], error: null });
    expect(await service.resyncRedirects()).toEqual({ ok: true, count: 1, synced: false });
    redis.configured = true;
    await service.resyncRedirects();
    expect(redis.redisTransaction).toHaveBeenLastCalledWith([["DEL", "redirects:resync"], ["DEL", "redirects"]]);
  });

  it("after a slug change, drops the new target from Redis and writes what points to it", async () => {
    redis.configured = true;
    repo.redirectsTo.mockResolvedValueOnce({ data: [{ from_path: "/tours/cu", to_path: "/tours/moi", status_code: 301 }], error: null });
    await service.syncSlugRedirect("/tours/moi");
    expect(redis.redisPipeline).toHaveBeenCalledWith([
      ["HDEL", "redirects", "/tours/moi"],
      ["HSET", "redirects", "/tours/cu", '{"to":"/tours/moi","status":301}'],
    ]);
  });
});
