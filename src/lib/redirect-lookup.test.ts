import { describe, expect, it, vi } from "vitest";

import { createRedirectLookup, lookupKeys, parseStoredRedirect } from "./redirect-lookup";

/** A fake Upstash REST pipeline over in-memory hashes, counting calls. */
function fakeRedis(hash: Record<string, string>, behaviour: "ok" | "error" | "hang" | "http500" = "ok", languages: Record<string, string> = {}) {
  const calls: unknown[][] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const commands = JSON.parse(String(init?.body)) as string[][];
    calls.push(commands[0]);
    if (behaviour === "error") throw new TypeError("fetch failed");
    if (behaviour === "http500") return new Response("{}", { status: 500 });
    if (behaviour === "hang") {
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    }
    expect(commands.map(([name, key]) => [name, key])).toEqual([
      ["HMGET", "redirects"],
      ["HMGET", "redirects:languages"],
    ]);
    const [, ...fields] = commands[0].slice(1);
    return Response.json([{ result: fields.map((field) => hash[field] ?? null) }, { result: fields.map((field) => languages[field] ?? null) }]);
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const entry = (to: unknown, status: unknown = 301) => JSON.stringify({ to, status });

describe("parseStoredRedirect", () => {
  it("accepts site paths with 301 or 302, exactly as stored", () => {
    expect(parseStoredRedirect(entry("/tours/moi"))).toEqual({ to: "/tours/moi", status: 301 });
    expect(parseStoredRedirect(entry("/tours?dest=japan", 302))).toEqual({ to: "/tours?dest=japan", status: 302 });
    expect(parseStoredRedirect(entry("/t%E1%BB%91i"))).toEqual({ to: "/t%E1%BB%91i", status: 301 });
  });

  it("refuses targets off the site, other statuses and broken values, and logs why", () => {
    const log = vi.fn();
    for (const to of ["https://evil.example", "//evil.example", "/\\evil.example", "/a b", "/a\u0000b", "evil", 42]) {
      expect(parseStoredRedirect(entry(to), log), String(to)).toBeNull();
    }
    for (const status of [307, 308, 200, "301"]) expect(parseStoredRedirect(entry("/ok", status), log)).toBeNull();
    expect(parseStoredRedirect("{not json", log)).toBeNull();
    expect(parseStoredRedirect(null, log)).toBeNull();
    expect(log).toHaveBeenCalledWith("redirects.invalid_value", { reason: "target" });
    expect(log).toHaveBeenCalledWith("redirects.invalid_value", { reason: "status" });
    expect(log).toHaveBeenCalledWith("redirects.invalid_value", { reason: "json" });
  });
});

describe("lookupKeys", () => {
  it("adds the decoded path only when it differs, and survives broken escapes", () => {
    expect(lookupKeys("/tour-cu")).toEqual(["/tour-cu"]);
    expect(lookupKeys("/tour-c%C5%A9")).toEqual(["/tour-c%C5%A9", "/tour-cũ"]);
    expect(lookupKeys("/bad%E0%A4%A")).toEqual(["/bad%E0%A4%A"]);
  });
});

describe("createRedirectLookup", () => {
  it("returns the stored redirect, by the raw or the decoded path", async () => {
    const { fetchImpl, calls } = fakeRedis({ "/cu": entry("/moi"), "/tour-cũ": entry("/tours/moi", 302) });
    const lookup = createRedirectLookup({ url: "https://redis.example/", token: "t", fetch: fetchImpl });
    expect(await lookup("/cu")).toEqual({ to: "/moi", status: 301 });
    expect(await lookup("/tour-c%C5%A9")).toEqual({ to: "/tours/moi", status: 302 });
    expect(await lookup("/khong-co")).toBeNull();
    expect(calls).toEqual([
      ["HMGET", "redirects", "/cu"],
      ["HMGET", "redirects", "/tour-c%C5%A9", "/tour-cũ"],
      ["HMGET", "redirects", "/khong-co"],
    ]);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe("https://redis.example/pipeline");
  });

  it("also answers other-language slugs, after the admin's redirects", async () => {
    const { fetchImpl } = fakeRedis({ "/en/tours/a": entry("/admin-wins", 302) }, "ok", {
      "/en/tours/a": entry("/en/tours/x"),
      "/tours/b": entry("/tours/y"),
    });
    const lookup = createRedirectLookup({ url: "https://r", token: "t", fetch: fetchImpl });
    expect(await lookup("/en/tours/a")).toEqual({ to: "/admin-wins", status: 302 });
    expect(await lookup("/tours/b")).toEqual({ to: "/tours/y", status: 301 });
  });

  it("caches hits and misses for 60 s per instance", async () => {
    let time = 0;
    const { fetchImpl, calls } = fakeRedis({ "/cu": entry("/moi") });
    const lookup = createRedirectLookup({ url: "https://r", token: "t", fetch: fetchImpl, now: () => time });
    await lookup("/cu");
    await lookup("/khong-co");
    time = 59_000;
    expect(await lookup("/cu")).toEqual({ to: "/moi", status: 301 });
    expect(await lookup("/khong-co")).toBeNull();
    expect(calls).toHaveLength(2);
    time = 61_000;
    await lookup("/cu");
    expect(calls).toHaveLength(3);
  });

  it("ignores an invalid stored value (cached as a miss)", async () => {
    const log = vi.fn();
    const { fetchImpl } = fakeRedis({ "/cu": entry("https://evil.example") });
    const lookup = createRedirectLookup({ url: "https://r", token: "t", fetch: fetchImpl, log });
    expect(await lookup("/cu")).toBeNull();
    expect(log).toHaveBeenCalledWith("redirects.invalid_value", { reason: "target" });
  });

  it("fails open after 50 ms or on errors, then skips Redis for a while", async () => {
    let time = 0;
    const log = vi.fn();
    const hang = fakeRedis({}, "hang");
    const slow = createRedirectLookup({ url: "https://r", token: "t", fetch: hang.fetchImpl, now: () => time, log });
    const started = Date.now();
    expect(await slow("/cu")).toBeNull();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(log).toHaveBeenCalledWith("redirects.lookup_failed", expect.anything());
    expect(await slow("/khac")).toBeNull();
    expect(hang.calls).toHaveLength(1);
    time = 11_000;
    await slow("/khac");
    expect(hang.calls).toHaveLength(2);

    for (const behaviour of ["error", "http500"] as const) {
      const failing = fakeRedis({ "/cu": entry("/moi") }, behaviour);
      expect(await createRedirectLookup({ url: "https://r", token: "t", fetch: failing.fetchImpl })("/cu")).toBeNull();
    }
  });

  it("keeps at most maxEntries paths", async () => {
    const { fetchImpl, calls } = fakeRedis({});
    const lookup = createRedirectLookup({ url: "https://r", token: "t", fetch: fetchImpl, maxEntries: 2 });
    await lookup("/a");
    await lookup("/b");
    await lookup("/c");
    await lookup("/a");
    expect(calls).toHaveLength(4);
  });
});
