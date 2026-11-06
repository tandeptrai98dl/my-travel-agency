import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
const repo = vi.hoisted(() => ({
  listReviewRows: vi.fn<(...args: unknown[]) => Promise<Result & { count?: number }>>(async () => ({ data: [], error: null, count: 0 })),
  findReview: vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data: null, error: null })),
  updateReview: vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data: { id: "r1" }, error: null })),
}));
vi.mock("./reviews.repository", () => repo);
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: vi.fn(async () => ({ id: "u1", role: "editor" })) }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/modules/catalog/tours/tours.service", () => ({ tourTag: (id: string) => `tour:${id}` }));

const { updateTag } = await import("next/cache");
const { requirePermission } = await import("@/lib/auth/require-role");
const service = await import("./reviews.service");

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const stored = (overrides: Record<string, unknown> = {}) => ({ id: "r1", tour_id: "t1", status: "pending", is_featured: false, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  repo.findReview.mockResolvedValue({ data: stored(), error: null });
});

describe("moderateReview", () => {
  it("approves with the content permission and refreshes reviews and the tour", async () => {
    expect(await service.moderateReview({ id: ID, action: "approve" })).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith("content.manage");
    expect(repo.updateReview).toHaveBeenCalledWith("r1", { status: "approved" });
    expect(updateTag).toHaveBeenCalledWith("reviews");
    expect(updateTag).toHaveBeenCalledWith("tour:t1");
  });

  it("unfeatures a review in the same write that rejects it", async () => {
    repo.findReview.mockResolvedValue({ data: stored({ status: "approved", is_featured: true }), error: null });
    await service.moderateReview({ id: ID, action: "reject" });
    expect(repo.updateReview).toHaveBeenCalledWith("r1", { status: "rejected", is_featured: false });
  });

  it("features only approved reviews and never touches text or the verified flag", async () => {
    expect(await service.moderateReview({ id: ID, action: "feature", featured: true })).toEqual({ ok: false, error: "featureNeedsApproved" });
    expect(repo.updateReview).not.toHaveBeenCalled();
    repo.findReview.mockResolvedValue({ data: stored({ status: "approved" }), error: null });
    await service.moderateReview({ id: ID, action: "feature", featured: true });
    expect(repo.updateReview).toHaveBeenCalledWith("r1", { is_featured: true });
  });

  it("reports a missing review and maps the database check", async () => {
    repo.findReview.mockResolvedValueOnce({ data: null, error: null });
    expect(await service.moderateReview({ id: ID, action: "approve" })).toEqual({ ok: false, error: "not_found" });
    repo.findReview.mockResolvedValueOnce({ data: stored({ status: "approved" }), error: null });
    repo.updateReview.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "reviews_featured_approved" } });
    expect(await service.moderateReview({ id: ID, action: "feature", featured: true })).toEqual({ ok: false, error: "featureNeedsApproved" });
  });
});

describe("listReviews", () => {
  it("passes the status and verified filters", async () => {
    await service.listReviews({ filters: { status: "pending", verified: "yes" }, sort: "created_at", dir: "desc", page: 2 });
    expect(repo.listReviewRows).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", verified: true, ascending: false, range: [20, 39] }),
    );
  });
});
