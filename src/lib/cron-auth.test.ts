import { describe, expect, it, vi } from "vitest";

const SECRET = "a-cron-secret-of-at-least-32-characters";

describe("cronAuthorization", () => {
  it("accepts exactly the bearer header Vercel sends", async () => {
    const { cronAuthorization } = await import("./cron-auth");
    expect(cronAuthorization(`Bearer ${SECRET}`, SECRET)).toBe("ok");
  });

  it("refuses a missing, empty, wrong, differently cased or padded header", async () => {
    const { cronAuthorization } = await import("./cron-auth");
    for (const header of [null, undefined, "", SECRET, `bearer ${SECRET}`, `Bearer ${SECRET} `, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, "Bearer "]) {
      expect(cronAuthorization(header, SECRET)).toBe("unauthorized");
    }
  });

  it("is unconfigured without a secret, whatever the header says", async () => {
    const { cronAuthorization } = await import("./cron-auth");
    expect(cronAuthorization("Bearer ", "")).toBe("unconfigured");
    expect(cronAuthorization("Bearer undefined", undefined)).toBe("unconfigured");
    expect(cronAuthorization(null, null)).toBe("unconfigured");
  });

  it("compares equal-length digests, so headers of any length never throw", async () => {
    vi.resetModules();
    const crypto = await import("node:crypto");
    const calls: [number, number][] = [];
    vi.doMock("node:crypto", () => ({
      ...crypto,
      timingSafeEqual: (a: Buffer, b: Buffer) => {
        calls.push([a.length, b.length]);
        return crypto.timingSafeEqual(a, b);
      },
    }));
    const { cronAuthorization } = await import("./cron-auth");
    expect(cronAuthorization("x".repeat(5000), SECRET)).toBe("unauthorized");
    expect(cronAuthorization("B", SECRET)).toBe("unauthorized");
    expect(cronAuthorization(`Bearer ${SECRET}`, SECRET)).toBe("ok");
    expect(calls).toEqual([
      [32, 32],
      [32, 32],
      [32, 32],
    ]);
    vi.doUnmock("node:crypto");
    vi.resetModules();
  });

  it("maps to HTTP statuses", async () => {
    const { cronStatus } = await import("./cron-auth");
    expect([cronStatus("ok"), cronStatus("unauthorized"), cronStatus("unconfigured")]).toEqual([200, 401, 503]);
  });
});
