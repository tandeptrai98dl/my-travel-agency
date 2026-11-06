import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ denied: false }));
const service = vi.hoisted(() => ({
  getCreateDefaults: vi.fn(async () => ({ ok: true })),
  previewDepartures: vi.fn(async () => ({ ok: true })),
  createDepartures: vi.fn(async () => ({ ok: true })),
  saveDeparture: vi.fn(async () => ({ ok: true })),
  deleteDeparture: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/auth/require-role", () => {
  class AccessDeniedError extends Error {}
  return {
    AccessDeniedError,
    requirePermission: vi.fn(async () => {
      if (access.denied) throw new AccessDeniedError("forbidden");
      return { id: "u1", role: "operator" };
    }),
  };
});
vi.mock("./departures.service", () => service);

const actions = await import("./departures.actions");
const { requirePermission } = await import("@/lib/auth/require-role");

beforeEach(() => {
  vi.clearAllMocks();
  access.denied = false;
});

describe("departure actions", () => {
  it("check the departures permission before reading the input", async () => {
    access.denied = true;
    expect(await actions.saveDepartureAction({ nonsense: true })).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.createDeparturesAction(null)).toEqual({ ok: false, error: "forbidden" });
    expect(requirePermission).toHaveBeenCalledWith("departures.edit");
    expect(service.saveDeparture).not.toHaveBeenCalled();
  });

  it("return field errors for invalid input without calling the service", async () => {
    const result = await actions.saveDepartureAction({ id: "d1", status: "sold", capacity: 0, note: "", prices: null });
    expect(result).toMatchObject({ ok: false, error: "invalid", fields: { id: expect.any(String), status: expect.any(String), capacity: "outOfRange" } });
    expect(service.saveDeparture).not.toHaveBeenCalled();
    expect(await actions.deleteDepartureAction({ id: "not-a-uuid" })).toMatchObject({ ok: false, error: "invalid" });
  });

  it("pass parsed input to the service", async () => {
    await actions.saveDepartureAction({
      id: "0f8fad5b-d9cb-469f-a165-70867728950e",
      status: "closed",
      capacity: 12,
      note: "  ",
      prices: null,
    });
    expect(service.saveDeparture).toHaveBeenCalledWith(expect.objectContaining({ status: "closed", note: null }));
  });
});
