import { beforeEach, describe, expect, it, vi } from "vitest";

const { AccessDeniedError, requirePermission, service } = vi.hoisted(() => {
  class AccessDeniedError extends Error {}
  return {
    AccessDeniedError,
    requirePermission: vi.fn(),
    service: { saveDestination: vi.fn(), deleteCancellationPolicy: vi.fn() },
  };
});
vi.mock("@/lib/auth/require-role", () => ({ AccessDeniedError, requirePermission }));
vi.mock("./taxonomy.service", () => service);

const actions = await import("./taxonomy.actions");

beforeEach(() => vi.resetAllMocks());

describe("taxonomy actions", () => {
  it("check the permission before reading the input (no field hints for outsiders)", async () => {
    requirePermission.mockRejectedValue(new AccessDeniedError("denied"));
    expect(await actions.saveDestinationAction({ nonsense: true })).toEqual({ ok: false, error: "forbidden" });
    expect(requirePermission).toHaveBeenCalledWith("content.manage");
    expect(service.saveDestination).not.toHaveBeenCalled();
  });

  it("return field errors for invalid input", async () => {
    requirePermission.mockResolvedValue({ id: "u1", role: "editor" });
    const result = await actions.saveDestinationAction({ key: "Hạ Long" });
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    expect(result.ok === false && result.fields?.key).toBe("keyInvalid");
  });

  it("use the admin permission for cancellation policies", async () => {
    requirePermission.mockResolvedValue({ id: "u1", role: "admin" });
    service.deleteCancellationPolicy.mockResolvedValue({ ok: true });
    await actions.deleteCancellationPolicyAction({ id: "0f8fad5b-d9cb-469f-a165-70867728950e" });
    expect(requirePermission).toHaveBeenCalledWith("settings.manage");
  });
});
