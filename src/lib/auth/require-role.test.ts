import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "./get-user";

const getCurrentUser = vi.fn<() => Promise<CurrentUser | null>>();
vi.mock("@/lib/auth/get-user", () => ({ getCurrentUser: () => getCurrentUser() }));

const { AccessDeniedError, checkAccess, requirePermission, requireRole } = await import(
  "./require-role"
);

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "staff@example.test",
    fullName: null,
    role: "sales",
    locale: "vi",
    aal: "aal1",
    hasVerifiedFactor: false,
    ...overrides,
  };
}

describe("checkAccess", () => {
  it("rejects signed-out visitors", () => {
    expect(checkAccess(null, ["sales"])).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("rejects roles outside the list", () => {
    expect(checkAccess(user({ role: "customer" }), ["sales", "admin"])).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("lets non-MFA roles through at aal1", () => {
    expect(checkAccess(user({ role: "editor" }), ["editor"]).ok).toBe(true);
  });

  it("sends admin and accountant without a factor to enrolment", () => {
    for (const role of ["admin", "accountant"] as const) {
      expect(checkAccess(user({ role }), [role])).toEqual({
        ok: false,
        reason: "mfa_enrollment_required",
      });
    }
  });

  it("asks admin with a factor but an aal1 session to verify", () => {
    expect(checkAccess(user({ role: "admin", hasVerifiedFactor: true }), ["admin"])).toEqual({
      ok: false,
      reason: "mfa_verification_required",
    });
  });

  it("allows admin and accountant at aal2", () => {
    expect(checkAccess(user({ role: "admin", aal: "aal2", hasVerifiedFactor: true }), ["admin"]).ok).toBe(true);
    expect(
      checkAccess(user({ role: "accountant", aal: "aal2", hasVerifiedFactor: true }), ["accountant"]).ok,
    ).toBe(true);
  });

  it("checks the role before MFA", () => {
    expect(checkAccess(user({ role: "accountant" }), ["editor"])).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });
});

describe("requireRole", () => {
  beforeEach(() => getCurrentUser.mockReset());

  it("returns the user when access is granted", async () => {
    const current = user({ role: "operator" });
    getCurrentUser.mockResolvedValue(current);
    await expect(requireRole(["operator"])).resolves.toBe(current);
  });

  it("throws AccessDeniedError with the reason", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireRole(["admin"])).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(requireRole(["admin"])).rejects.toMatchObject({ reason: "unauthenticated" });
  });

  it("maps permissions to roles", async () => {
    getCurrentUser.mockResolvedValue(user({ role: "editor" }));
    await expect(requirePermission("bookings.read")).rejects.toMatchObject({ reason: "forbidden" });
    await expect(requirePermission("content.manage")).resolves.toMatchObject({ role: "editor" });
  });
});
