import { describe, expect, it } from "vitest";

import { statusVariant } from "./status-badge";

describe("statusVariant", () => {
  it("uses the success colour only for good outcomes and red only for failures", () => {
    expect(statusVariant("booking", "confirmed")).toBe("success");
    expect(statusVariant("booking", "pending_payment")).toBe("warning");
    expect(statusVariant("booking", "cancelled")).toBe("destructive");
    expect(statusVariant("payment", "paid")).toBe("success");
    expect(statusVariant("transaction", "failed")).toBe("destructive");
    expect(statusVariant("departure", "guaranteed")).toBe("gold");
    expect(statusVariant("publish", "published")).toBe("success");
    expect(statusVariant("publish", "draft")).toBe("outline");
    expect(statusVariant("review", "pending")).toBe("warning");
  });

  it("falls back to outline for an unknown value (e.g. a new enum before the map is updated)", () => {
    // @ts-expect-error -- simulating a value the generated types do not know yet
    expect(statusVariant("booking", "on_hold")).toBe("outline");
  });
});
