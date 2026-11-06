import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ denied: false }));
const service = vi.hoisted(() => ({
  cancelBooking: vi.fn(async () => ({ ok: true })),
  requestCancellation: vi.fn(async () => ({ ok: true })),
  resolveAttention: vi.fn(async () => ({ ok: true })),
  updateContact: vi.fn(async () => ({ ok: true })),
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
vi.mock("./booking-admin.service", () => service);

const actions = await import("./booking-admin.actions");
const { requirePermission } = await import("@/lib/auth/require-role");

const BOOKING = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  vi.clearAllMocks();
  access.denied = false;
});

describe("booking admin actions", () => {
  it("check each action's permission before reading the input", async () => {
    access.denied = true;
    expect(await actions.cancelBookingAction(null)).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.requestCancellationAction(null)).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.resolveAttentionAction(null)).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.updateContactAction(null)).toEqual({ ok: false, error: "forbidden" });
    expect(vi.mocked(requirePermission).mock.calls.map((call) => call[0])).toEqual([
      "bookings.change_status",
      "bookings.request_cancellation",
      "bookings.resolve_attention",
      "bookings.edit",
    ]);
    expect(service.cancelBooking).not.toHaveBeenCalled();
  });

  it("require a note and valid contact details", async () => {
    expect(await actions.cancelBookingAction({ bookingId: BOOKING, note: "x" })).toMatchObject({
      ok: false,
      fields: { note: "noteRequired" },
    });
    expect(
      await actions.updateContactAction({ bookingId: BOOKING, contactName: "", contactEmail: "no", contactPhone: "abc", specialRequests: "" }),
    ).toMatchObject({ ok: false, fields: { contactName: "required", contactEmail: "emailInvalid", contactPhone: "phoneInvalid" } });
    expect(service.updateContact).not.toHaveBeenCalled();
  });

  it("pass parsed values to the service", async () => {
    await actions.resolveAttentionAction({ bookingId: BOOKING, note: "  refunded the extra transfer " });
    expect(service.resolveAttention).toHaveBeenCalledWith({ bookingId: BOOKING, note: "refunded the extra transfer" });
    await actions.updateContactAction({
      bookingId: BOOKING,
      contactName: " Phạm Hà ",
      contactEmail: "HA@Example.test",
      contactPhone: "+84 900 000 000",
      specialRequests: "",
    });
    expect(service.updateContact).toHaveBeenCalledWith({
      bookingId: BOOKING,
      contactName: "Phạm Hà",
      contactEmail: "ha@example.test",
      contactPhone: "+84 900 000 000",
      specialRequests: "",
    });
  });
});
