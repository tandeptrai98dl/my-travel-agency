import { describe, expect, it } from "vitest";

import { paymentErrorCode, transferFromPayload } from "./payment-admin.schemas";

describe("payment admin helpers", () => {
  it("map the functions' errors to message keys", () => {
    expect(paymentErrorCode({ code: "42501", message: "forbidden" })).toBe("forbidden");
    expect(paymentErrorCode({ code: "P0002", message: "not_found" })).toBe("not_found");
    expect(paymentErrorCode({ code: "40P01", message: "deadlock detected" })).toBe("retry");
    expect(paymentErrorCode({ code: "P0001", message: "refund_too_large" })).toBe("refund_too_large");
    expect(paymentErrorCode({ code: "P0001", message: "not_unmatched" })).toBe("not_unmatched");
    expect(paymentErrorCode({ code: "P0001", message: "something else" })).toBe("failed");
    expect(paymentErrorCode(null)).toBe("failed");
  });

  it("read amount and memo from SePay and Casso payloads", () => {
    expect(transferFromPayload({ id: 1, transferType: "in", transferAmount: 3_000_000, content: "chuyen tien" })).toEqual({
      amount: 3_000_000,
      memo: "chuyen tien",
    });
    expect(transferFromPayload({ id: 2, amount: 500_000, description: "PTA hello" })).toEqual({ amount: 500_000, memo: "PTA hello" });
    expect(transferFromPayload({ amount: "500000" })).toEqual({ amount: null, memo: "" });
    expect(transferFromPayload(null)).toEqual({ amount: null, memo: "" });
    expect(transferFromPayload([1, 2])).toEqual({ amount: null, memo: "" });
  });
});
