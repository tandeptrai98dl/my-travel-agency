import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { message?: string } | null };
const repo = vi.hoisted(() => ({
  listSubscriberRows: vi.fn<(...args: unknown[]) => Promise<Result & { count?: number }>>(async () => ({ data: [], error: null, count: 0 })),
  activeSubscriberRows: vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data: [], error: null })),
  writeAuditRow: vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data: null, error: null })),
}));
vi.mock("./subscribers.repository", () => repo);
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
      data: [{ email: "=cmd@b.c", locale: "vi", source: "footer", confirmed_at: "2026-11-01", created_at: "2026-11-01" }],
      error: null,
    });
    const result = await service.exportSubscribers();
    expect(repo.writeAuditRow).toHaveBeenCalledWith(
      expect.objectContaining({ actor_id: "u1", action: "subscribers.export", entity_type: "subscribers", changes: { count: 1, scope: "active" } }),
    );
    expect(result.ok && result.csv).toBe('"email","locale","source","confirmed_at","created_at"\r\n"\'=cmd@b.c","vi","footer","2026-11-01","2026-11-01"\r\n');
  });

  it("gives no file when the audit row cannot be written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    repo.writeAuditRow.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect(await service.exportSubscribers()).toEqual({ ok: false, error: "failed" });
  });
});
