import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ denied: false }));
const service = vi.hoisted(() => ({
  createQuote: vi.fn(async () => ({ ok: true, id: "b1" })),
  createPaymentLink: vi.fn(async () => ({ ok: true, url: "https://example.test/en/pay/x", amount: 1, expiresAt: "" })),
}));
vi.mock("@/lib/auth/require-role", () => {
  class AccessDeniedError extends Error {}
  return {
    AccessDeniedError,
    requirePermission: vi.fn(async () => {
      if (access.denied) throw new AccessDeniedError("forbidden");
      return { id: "u1", role: "sales" };
    }),
  };
});
vi.mock("./quote.service", () => service);

const actions = await import("./quote.actions");
const { requirePermission } = await import("@/lib/auth/require-role");

beforeEach(() => {
  vi.clearAllMocks();
  access.denied = false;
});

describe("quote actions", () => {
  it("check the permission before reading the input", async () => {
    access.denied = true;
    expect(await actions.createQuoteAction(null)).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.createPaymentLinkAction(null)).toEqual({ ok: false, error: "forbidden" });
    expect(vi.mocked(requirePermission).mock.calls.map((call) => call[0])).toEqual(["bookings.edit", "bookings.send_payment_link"]);
    expect(service.createQuote).not.toHaveBeenCalled();
  });

  it("validate the link input", async () => {
    expect(await actions.createPaymentLinkAction({ bookingId: "0f8fad5b-d9cb-469f-a165-70867728950e", validHours: 500 })).toMatchObject({
      ok: false,
      fields: { validHours: "outOfRange" },
    });
    await actions.createPaymentLinkAction({ bookingId: "0f8fad5b-d9cb-469f-a165-70867728950e", validHours: 48 });
    expect(service.createPaymentLink).toHaveBeenCalledWith({ bookingId: "0f8fad5b-d9cb-469f-a165-70867728950e", validHours: 48 });
  });
});
