import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({ validatedPublicEnv: { NEXT_PUBLIC_SITE_URL: "https://travel.example" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
const requirePermission = vi.fn(async () => ({ id: "admin-1", role: "admin" }));
vi.mock("@/lib/auth/require-role", () => ({ requirePermission }));

type Result = { data: unknown; error: null | { code?: string; status?: number; message: string } };
const fn = (data: unknown) => vi.fn(async (...args: unknown[]): Promise<Result> => (void args, { data, error: null }));
const repo = {
  listStaffProfiles: fn([]),
  findProfile: fn(null),
  activeAdminIds: fn([{ id: "admin-1" }, { id: "admin-2" }]),
  updateProfile: fn({ id: "x" }),
  authUser: fn({ user: null }),
  profileByEmail: fn(null),
  inviteUser: fn({ user: { id: "new-1" } }),
  setInvitedProfile: fn({ id: "new-1" }),
  deleteAuthUser: fn({}),
  insertAuditLog: fn(null),
};
vi.mock("./staff.repository", () => repo);

const service = await import("./staff.service");
const { inviteStaffSchema, staffChangeBlock } = await import("./staff.schemas");

const profile = (id: string, role: string, is_active = true) => ({ id, email: `${id}@x.test`, full_name: null, role, is_active, deleted_at: null });

beforeEach(() => {
  vi.clearAllMocks();
  repo.activeAdminIds.mockResolvedValue({ data: [{ id: "admin-1" }, { id: "admin-2" }], error: null });
  repo.updateProfile.mockResolvedValue({ data: { id: "x" }, error: null });
  repo.inviteUser.mockResolvedValue({ data: { user: { id: "new-1" } }, error: null });
  repo.setInvitedProfile.mockResolvedValue({ data: { id: "new-1" }, error: null });
  repo.insertAuditLog.mockResolvedValue({ data: null, error: null });
  repo.profileByEmail.mockResolvedValue({ data: null, error: null });
  repo.deleteAuthUser.mockResolvedValue({ data: {}, error: null });
});

describe("staffChangeBlock", () => {
  const context = { selfId: "admin-1", activeAdminIds: ["admin-1", "admin-2"] };
  it("never lets an admin change or deactivate themself", () => {
    expect(staffChangeBlock({ id: "admin-1", role: "admin", active: true }, { role: "editor" }, context)).toBe("selfChange");
    expect(staffChangeBlock({ id: "admin-1", role: "admin", active: true }, { active: false }, context)).toBe("selfChange");
  });
  it("keeps the last active admin", () => {
    const one = { selfId: "admin-1", activeAdminIds: ["admin-2"] };
    expect(staffChangeBlock({ id: "admin-2", role: "admin", active: true }, { role: "sales" }, one)).toBe("lastAdmin");
    expect(staffChangeBlock({ id: "admin-2", role: "admin", active: true }, { role: "sales" }, context)).toBeNull();
    // Reactivating or promoting is never blocked.
    expect(staffChangeBlock({ id: "ed-1", role: "editor", active: false }, { active: true }, one)).toBeNull();
    expect(staffChangeBlock({ id: "ed-1", role: "editor", active: true }, { role: "admin" }, one)).toBeNull();
  });
});

describe("inviteStaff", () => {
  const input = inviteStaffSchema.parse({ email: " New@Example.TEST ", fullName: "Lan", role: "editor" });

  it("invites, sets the chosen role and writes the audit row with the inviting admin", async () => {
    expect(input.email).toBe("new@example.test");
    expect(await service.inviteStaff(input)).toEqual({ ok: true, id: "new-1" });
    expect(requirePermission).toHaveBeenCalledWith("staff.manage");
    expect(repo.inviteUser).toHaveBeenCalledWith(
      "new@example.test",
      { full_name: "Lan", locale: "vi" },
      "https://travel.example/auth/update-password",
    );
    expect(repo.setInvitedProfile).toHaveBeenCalledWith("new-1", "editor", "Lan");
    expect(repo.insertAuditLog).toHaveBeenCalledWith({
      actor_id: "admin-1",
      action: "staff.invite",
      entity_id: "new-1",
      changes: { after: { role: "editor" } },
    });
  });

  it("removes the invited account when the audit row cannot be written", async () => {
    repo.insertAuditLog.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "denied" } });
    expect(await service.inviteStaff(input)).toEqual({ ok: false, error: "failed" });
    expect(repo.deleteAuthUser).toHaveBeenCalledWith("new-1");
  });

  it("never removes an account that existed before the invitation", async () => {
    repo.profileByEmail.mockResolvedValueOnce({ data: { id: "new-1" }, error: null });
    repo.setInvitedProfile.mockResolvedValueOnce({ data: null, error: { code: "PGRST116", message: "no row" } });
    expect(await service.inviteStaff(input)).toEqual({ ok: false, error: "failed" });
    expect(repo.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("logs a rollback that fails", async () => {
    const { logger } = await import("@/lib/logger");
    repo.insertAuditLog.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "denied" } });
    repo.deleteAuthUser.mockResolvedValueOnce({ data: null, error: { code: "unexpected_failure", status: 500, message: "x" } });
    expect(await service.inviteStaff(input)).toEqual({ ok: false, error: "failed" });
    expect(logger.error).toHaveBeenCalledWith("staff.invite_rollback_failed", { code: "unexpected_failure", status: 500 });
  });

  it("reports an email that already has an account", async () => {
    repo.inviteUser.mockResolvedValueOnce({ data: { user: null }, error: { code: "email_exists", status: 422, message: "exists" } });
    expect(await service.inviteStaff(input)).toEqual({ ok: false, error: "emailTaken", field: "email" });
    expect(repo.setInvitedProfile).not.toHaveBeenCalled();
  });

  it("refuses customer as an invitation role", () => {
    expect(inviteStaffSchema.safeParse({ email: "a@b.test", fullName: "A", role: "customer" }).success).toBe(false);
  });
});

describe("role changes and deactivation", () => {
  it("refuses changing yourself before writing", async () => {
    repo.findProfile.mockResolvedValueOnce({ data: profile("admin-1", "admin"), error: null });
    expect(await service.changeStaffRole({ id: "admin-1", role: "editor" })).toEqual({ ok: false, error: "selfChange" });
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it("refuses removing the last active admin", async () => {
    repo.activeAdminIds.mockResolvedValueOnce({ data: [{ id: "admin-2" }], error: null });
    repo.findProfile.mockResolvedValueOnce({ data: profile("admin-2", "admin"), error: null });
    expect(await service.setStaffActive({ id: "admin-2", active: false })).toEqual({ ok: false, error: "lastAdmin" });
  });

  it("does not manage customers", async () => {
    repo.findProfile.mockResolvedValueOnce({ data: profile("c-1", "customer"), error: null });
    expect(await service.changeStaffRole({ id: "c-1", role: "admin" })).toEqual({ ok: false, error: "notFound" });
  });

  it("writes with the session and maps the database rules", async () => {
    repo.findProfile.mockResolvedValue({ data: profile("ed-1", "editor"), error: null });
    expect(await service.changeStaffRole({ id: "ed-1", role: "operator" })).toEqual({ ok: true, id: "ed-1" });
    expect(repo.updateProfile).toHaveBeenCalledWith("ed-1", { role: "operator" });
    expect(await service.setStaffActive({ id: "ed-1", active: false })).toEqual({ ok: true, id: "ed-1" });
    expect(repo.updateProfile).toHaveBeenLastCalledWith("ed-1", { is_active: false });

    repo.updateProfile.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "the last active admin keeps the role" } });
    expect(await service.changeStaffRole({ id: "ed-1", role: "sales" })).toEqual({ ok: false, error: "lastAdmin" });
    // RLS hid the row: nothing changed.
    repo.updateProfile.mockResolvedValueOnce({ data: null, error: null });
    expect(await service.changeStaffRole({ id: "ed-1", role: "sales" })).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("listStaff", () => {
  it("derives the invited, active and deactivated states and MFA from Auth", async () => {
    repo.listStaffProfiles.mockResolvedValueOnce({
      data: [profile("admin-1", "admin"), profile("ed-1", "editor"), profile("op-1", "operator", false)],
      error: null,
    });
    repo.authUser.mockImplementation(async (id: unknown) => ({
      data: {
        user:
          id === "admin-1"
            ? { email_confirmed_at: "2026-11-01", last_sign_in_at: "2026-11-07T01:00:00Z", factors: [{ factor_type: "totp", status: "verified" }] }
            : { email_confirmed_at: null, last_sign_in_at: null, factors: [] },
      },
      error: null,
    }));
    const staff = await service.listStaff();
    expect(staff.map((member) => [member.id, member.status, member.mfa, member.isSelf])).toEqual([
      ["admin-1", "active", true, true],
      ["ed-1", "invited", false, false],
      ["op-1", "deactivated", false, false],
    ]);
  });
});
