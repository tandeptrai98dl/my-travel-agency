import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { message?: string } | null };
const repo = vi.hoisted(() => ({
  listSubscriberRows: vi.fn<(...args: unknown[]) => Promise<Result & { count?: number }>>(async () => ({ data: [], error: null, count: 0 })),
  activeSubscriberRows: vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data: [], error: null })),
  writeAuditRow: vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data: null, error: null })),
  issueUnsubscribeTokens: vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data: 1, error: null })),
}));
vi.mock("./subscribers.repository", () => repo);
vi.mock("@/lib/site-url", () => ({ siteUrl: new URL("https://example.vn") }));
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: vi.fn(async () => ({ id: "u1", role: "editor" })) }));

const { requirePermission } = await import("@/lib/auth/require-role");
const service = await import("./subscribers.service");

beforeEach(() => vi.clearAllMocks());

describe("subscribers", () => {
  it("lists with the newsletter permission and derives each state", async () => {
    repo.listSubscriberRows.mockResolvedValueOnce({
      data: [
        { id: "1", email: "a@b.c", locale: "vi", source: "footer", confirmed_at: "2026-11-01", unsubscribed_at: null, created_at: "2026-11-01" },
        { id: "2", email: "d@e.f", locale: "en", source: null, confirmed_at: null, unsubscribed_at: null, created_at: "2026-11-02" },
        { id: "3", email: "g@h.i", locale: "vi", source: null, confirmed_at: "2026-11-01", unsubscribed_at: "2026-11-03", created_at: "2026-11-01" },
      ],
      error: null,
      count: 3,
    });
    const { items } = await service.listSubscribers({ q: "", filters: { state: "active" }, page: 1 });
    expect(requirePermission).toHaveBeenCalledWith("newsletter.manage");
    expect(repo.listSubscriberRows).toHaveBeenCalledWith(expect.objectContaining({ state: "active" }));
    expect(items.map((item) => item.state)).toEqual(["active", "pending", "unsubscribed"]);
  });

  it("records the export in the audit log before returning the CSV", async () => {
    repo.activeSubscriberRows.mockResolvedValueOnce({
      data: [{ id: "s1", email: "=cmd@b.c", locale: "vi", source: "footer", confirmed_at: "2026-11-01", created_at: "2026-11-01" }],
      error: null,
    });
    const result = await service.exportSubscribers();
    expect(repo.writeAuditRow).toHaveBeenCalledWith(
      expect.objectContaining({ actor_id: "u1", action: "subscribers.export", entity_type: "subscribers", changes: { count: 1, scope: "active", unsubscribe_links: true } }),
    );
    expect(repo.writeAuditRow.mock.invocationCallOrder[0]).toBeLessThan(repo.issueUnsubscribeTokens.mock.invocationCallOrder[0]);
    expect(result.ok && result.csv).toMatch(
      /^"email","locale","source","confirmed_at","created_at","unsubscribe_url"\r\n"'=cmd@b\.c","vi","footer","2026-11-01","2026-11-01","https:\/\/example\.vn\/ban-tin\/huy\?token=[A-Za-z0-9_-]{43}"\r\n$/,
    );
  });

  it("issues a fresh single-use unsubscribe token per subscriber and stores only its hash", async () => {
    repo.activeSubscriberRows.mockResolvedValueOnce({
      data: [
        { id: "s1", email: "a@b.c", locale: "vi", source: null, confirmed_at: "2026-11-01", created_at: "2026-11-01" },
        { id: "s2", email: "d@e.f", locale: "en", source: null, confirmed_at: "2026-11-01", created_at: "2026-11-01" },
      ],
      error: null,
    });
    const result = await service.exportSubscribers();
    const [ids, hashes] = repo.issueUnsubscribeTokens.mock.calls[0] as [string[], string[]];
    expect(ids).toEqual(["s1", "s2"]);
    expect(hashes.every((hash) => /^[0-9a-f]{64}$/.test(hash))).toBe(true);
    const { createHash } = await import("node:crypto");
    const tokens = [...(result.ok ? result.csv : "").matchAll(/token=([A-Za-z0-9_-]{43})/g)].map((match) => match[1]);
    expect(tokens).toHaveLength(2);
    expect(tokens.map((token) => createHash("sha256").update(token).digest("hex"))).toEqual(hashes);
    expect(result.ok && result.csv).toContain("https://example.vn/en/newsletter/unsubscribe?token=");
    // The plaintext tokens appear only in the file.
    expect(JSON.stringify(repo.writeAuditRow.mock.calls)).not.toContain(tokens[0]);
  });

  it("gives no file when the tokens cannot be stored", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    repo.activeSubscriberRows.mockResolvedValueOnce({ data: [{ id: "s1", email: "a@b.c", locale: "vi", source: null, confirmed_at: "x", created_at: "x" }], error: null });
    repo.issueUnsubscribeTokens.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect(await service.exportSubscribers()).toEqual({ ok: false, error: "failed" });
  });

  it("gives no file when the audit row cannot be written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    repo.writeAuditRow.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect(await service.exportSubscribers()).toEqual({ ok: false, error: "failed" });
  });
});
