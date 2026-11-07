import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestDeletion: vi.fn(),
  deletionState: vi.fn(),
  anonymise: vi.fn(),
  anonymiseAsAdmin: vi.fn(),
  banUser: vi.fn(),
  revokeSessions: vi.fn(),
  softDeleteUser: vi.fn(),
  signOutHere: vi.fn(),
  confirmCurrentPassword: vi.fn(),
  checkLimits: vi.fn(),
  requirePermission: vi.fn(),
}));
vi.mock("./account-deletion.repository", () => ({
  requestDeletion: mocks.requestDeletion,
  deletionState: mocks.deletionState,
  anonymise: mocks.anonymise,
  anonymiseAsAdmin: mocks.anonymiseAsAdmin,
  banUser: mocks.banUser,
  revokeSessions: mocks.revokeSessions,
  softDeleteUser: mocks.softDeleteUser,
  signOutHere: mocks.signOutHere,
}));
vi.mock("@/modules/identity/customer-auth.service", () => ({ confirmCurrentPassword: mocks.confirmCurrentPassword }));
vi.mock("@/modules/identity/auth-guards", () => ({ checkLimits: mocks.checkLimits }));
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { finishDeletionAsAdmin, requestMyDeletion, runDeletionSteps } = await import("./account-deletion.service");
const { logger } = await import("@/lib/logger");

const id = "00000000-0000-4000-8000-000000002601";
const open = { role: "customer", requested: true, profile_deleted: false, auth_deleted: false };
const ok = { data: {}, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deletionState.mockResolvedValue({ data: open, error: null });
  for (const fn of [mocks.banUser, mocks.revokeSessions, mocks.softDeleteUser, mocks.anonymise, mocks.anonymiseAsAdmin, mocks.signOutHere]) fn.mockResolvedValue(ok);
  mocks.requestDeletion.mockResolvedValue({ data: [], error: null });
  mocks.confirmCurrentPassword.mockResolvedValue({ id, email: "x@example.test", accessToken: "access-token" });
  mocks.checkLimits.mockResolvedValue("ok");
});

describe("deletion steps", () => {
  it("bans, revokes, anonymises, then soft-deletes, in that order", async () => {
    const order: string[] = [];
    mocks.banUser.mockImplementation(async () => (order.push("ban"), ok));
    mocks.revokeSessions.mockImplementation(async () => (order.push("revoke"), ok));
    mocks.anonymise.mockImplementation(async () => (order.push("anonymise"), ok));
    mocks.softDeleteUser.mockImplementation(async () => (order.push("soft_delete"), ok));
    expect(await runDeletionSteps(id, { accessToken: "access-token" })).toEqual({ status: "done" });
    expect(order).toEqual(["ban", "revoke", "anonymise", "soft_delete"]);
    expect(mocks.revokeSessions).toHaveBeenCalledWith("access-token");
  });

  it("stops at a failed ban: nothing else runs", async () => {
    mocks.banUser.mockResolvedValue({ data: null, error: { status: 500, code: "unexpected_failure" } });
    expect(await runDeletionSteps(id)).toEqual({ status: "failed", step: "ban" });
    expect(mocks.anonymise).not.toHaveBeenCalled();
    expect(mocks.softDeleteUser).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("customers.deletion_step_failed", { step: "ban", code: "unexpected_failure" });
  });

  it("stops at a failed SQL step: the Auth user is banned but not deleted", async () => {
    mocks.anonymise.mockResolvedValue({ data: null, error: { code: "40001" } });
    expect(await runDeletionSteps(id)).toEqual({ status: "failed", step: "anonymise" });
    expect(mocks.banUser).toHaveBeenCalled();
    expect(mocks.softDeleteUser).not.toHaveBeenCalled();
  });

  it("reports a failed soft delete", async () => {
    mocks.softDeleteUser.mockResolvedValue({ data: null, error: { status: 503 } });
    expect(await runDeletionSteps(id)).toEqual({ status: "failed", step: "soft_delete" });
    expect(logger.error).toHaveBeenCalledWith("customers.deletion_step_failed", { step: "soft_delete", code: "HTTP 503" });
  });

  it("a revoke failure is logged and the deletion goes on (the ban already stops refresh)", async () => {
    mocks.revokeSessions.mockResolvedValue({ data: null, error: { code: "session_not_found" } });
    expect(await runDeletionSteps(id, { accessToken: "t" })).toEqual({ status: "done" });
  });

  it("a retry runs only the steps left", async () => {
    mocks.deletionState.mockResolvedValue({ data: { ...open, profile_deleted: true }, error: null });
    expect(await runDeletionSteps(id)).toEqual({ status: "done" });
    expect(mocks.anonymise).not.toHaveBeenCalled();
    expect(mocks.banUser).toHaveBeenCalled();
    expect(mocks.softDeleteUser).toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.deletionState.mockResolvedValue({ data: { ...open, profile_deleted: true, auth_deleted: true }, error: null });
    expect(await runDeletionSteps(id)).toEqual({ status: "done" });
    expect(mocks.banUser).not.toHaveBeenCalled();
    expect(mocks.softDeleteUser).not.toHaveBeenCalled();
  });
});

describe("the customer's request", () => {
  const input = { current: "secret-password", locale: "vi" as const };

  it("needs the current password", async () => {
    mocks.confirmCurrentPassword.mockResolvedValue("invalid");
    expect(await requestMyDeletion(input)).toEqual({ status: "invalid", errors: { current: "wrongPassword" } });
    mocks.confirmCurrentPassword.mockResolvedValue("expired");
    expect(await requestMyDeletion(input)).toEqual({ status: "expired" });
    expect(mocks.requestDeletion).not.toHaveBeenCalled();
  });

  it("is rate-limited per user", async () => {
    mocks.checkLimits.mockResolvedValue("rate_limited");
    expect(await requestMyDeletion(input)).toEqual({ status: "rate_limited" });
    expect(mocks.checkLimits).toHaveBeenCalledWith([{ scope: "deletion", id, limit: 5, window: 3600 }]);
  });

  it("waits while a trip or money is open, with the request on record", async () => {
    mocks.requestDeletion.mockResolvedValue({ data: ["upcoming_trip"], error: null });
    expect(await requestMyDeletion(input)).toEqual({ status: "deletion_pending" });
    expect(mocks.requestDeletion).toHaveBeenCalledWith(id);
    expect(mocks.banUser).not.toHaveBeenCalled();
  });

  it("runs at once otherwise and signs this browser out", async () => {
    expect(await requestMyDeletion(input)).toEqual({ status: "deleted" });
    expect(mocks.revokeSessions).toHaveBeenCalledWith("access-token");
    expect(mocks.signOutHere).toHaveBeenCalled();
  });

  it("answers 'received' when a step fails, and still signs out", async () => {
    mocks.softDeleteUser.mockResolvedValue({ data: null, error: { status: 500 } });
    expect(await requestMyDeletion(input)).toEqual({ status: "received" });
    expect(mocks.signOutHere).toHaveBeenCalled();
  });

  it("does not delete staff accounts here", async () => {
    mocks.requestDeletion.mockResolvedValue({ data: null, error: { code: "P0002" } });
    expect(await requestMyDeletion(input)).toEqual({ status: "unavailable" });
  });
});

describe("the admin's way", () => {
  it("checks the permission and runs the SQL step through the role-checked wrapper", async () => {
    expect(await finishDeletionAsAdmin(id, "Chuyến đi đã kết thúc")).toEqual({ status: "done" });
    expect(mocks.requirePermission).toHaveBeenCalledWith("customers.delete_data");
    expect(mocks.anonymiseAsAdmin).toHaveBeenCalledWith(id, "Chuyến đi đã kết thúc");
    expect(mocks.anonymise).not.toHaveBeenCalled();
  });

  it("refuses an account without a request", async () => {
    mocks.deletionState.mockResolvedValue({ data: { ...open, requested: false }, error: null });
    expect(await finishDeletionAsAdmin(id, "note")).toEqual({ status: "not_requested" });
    expect(mocks.banUser).not.toHaveBeenCalled();
  });
});
