import { describe, expect, it } from "vitest";

import { attentionReason, attentionResolvers, bookingErrorCode, canResolveAttention } from "./booking-admin.schemas";

describe("booking admin helpers", () => {
  it("lets only accountants and admins clear money reasons, operators and admins a cancellation request", () => {
    for (const reason of ["overpaid", "underpaid", "late_payment_no_seats", "paid_after_cancel", "paid_quoted", "other"] as const) {
      expect(canResolveAttention("accountant", reason), reason).toBe(true);
      expect(canResolveAttention("admin", reason), reason).toBe(true);
      expect(canResolveAttention("operator", reason), reason).toBe(false);
      expect(canResolveAttention("sales", reason), reason).toBe(false);
    }
    expect(attentionResolvers("cancel_requested")).toEqual(["operator", "admin"]);
    expect(canResolveAttention("accountant", "cancel_requested")).toBe(false);
    expect(canResolveAttention("sales_manager", "cancel_requested")).toBe(false);
    expect(attentionResolvers("balance_overdue")).toEqual([]);
    expect(attentionResolvers("departure_cancelled")).toEqual([]);
  });

  it("treats an unknown stored reason as money (the strict default)", () => {
    expect(attentionReason("something_new")).toBe("other");
    expect(attentionResolvers(attentionReason("something_new"))).toEqual(["accountant", "admin"]);
    expect(attentionReason("paid_draft")).toBe("paid_draft");
  });

  it("maps database errors to message keys", () => {
    expect(bookingErrorCode({ code: "42501", message: "forbidden" })).toBe("forbidden");
    expect(bookingErrorCode({ code: "P0001", message: "not_cancellable" })).toBe("not_cancellable");
    expect(bookingErrorCode({ code: "40001" })).toBe("retry");
    expect(bookingErrorCode({ code: "P0001", message: "boom" })).toBe("failed");
  });
});
