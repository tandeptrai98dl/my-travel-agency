import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ denied: false }));
const service = vi.hoisted(() => ({
  recordManualPayment: vi.fn(async () => ({ ok: true })),
  recordRefund: vi.fn(async () => ({ ok: true })),
  assignTransfer: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/auth/require-role", () => {
  class AccessDeniedError extends Error {}
  return {
    AccessDeniedError,
    requirePermission: vi.fn(async () => {
      if (access.denied) throw new AccessDeniedError("forbidden");
      return { id: "u1", role: "accountant" };
    }),
  };
});
vi.mock("./payment-admin.service", () => service);

const actions = await import("./payment-admin.actions");
const { requirePermission } = await import("@/lib/auth/require-role");

const BOOKING = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  vi.clearAllMocks();
  access.denied = false;
});

describe("payment admin actions", () => {
  it("check the permission before reading the input", async () => {
    access.denied = true;
    expect(await actions.recordManualPaymentAction({ nonsense: true })).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.recordRefundAction(null)).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.assignTransferAction(null)).toEqual({ ok: false, error: "forbidden" });
    expect(requirePermission).toHaveBeenCalledWith("payments.record");
    expect(requirePermission).toHaveBeenCalledWith("payments.refund");
    expect(service.recordManualPayment).not.toHaveBeenCalled();
    expect(service.recordRefund).not.toHaveBeenCalled();
  });

  it("require a note, a whole positive amount and a manual method", async () => {
    const result = await actions.recordManualPaymentAction({ bookingId: BOOKING, amount: 1.5, method: "vnpay", note: " " });
    expect(result).toMatchObject({
      ok: false,
      error: "invalid",
      fields: { amount: "amountInvalid", method: "methodInvalid", note: "noteRequired" },
    });
    expect(await actions.recordRefundAction({ bookingId: BOOKING, amount: -1, method: "cash", note: "goodwill" })).toMatchObject({
      ok: false,
      fields: { amount: "amountInvalid" },
    });
    expect(service.recordManualPayment).not.toHaveBeenCalled();
  });

  it("pass trimmed values to the service", async () => {
    await actions.recordManualPaymentAction({ bookingId: BOOKING, amount: 3_000_000, method: "cash", note: "  paid at the office " });
    expect(service.recordManualPayment).toHaveBeenCalledWith({ bookingId: BOOKING, amount: 3_000_000, method: "cash", note: "paid at the office" });
    await actions.assignTransferAction({ eventId: BOOKING, bookingCode: " pta-2611-0042 ", note: "receipt sent" });
    expect(service.assignTransfer).toHaveBeenCalledWith({ eventId: BOOKING, bookingCode: "PTA-2611-0042", note: "receipt sent" });
  });
});
