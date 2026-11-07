import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/server", () => ({ serverEnv: { BOOKING_ACCESS_SECRET: undefined } }));

import { analyticsTransactionId } from "./analytics-transaction";

describe("analyticsTransactionId", () => {
  const secret = "x".repeat(40);

  it("is a stable 32-hex hash that never contains the code", () => {
    const id = analyticsTransactionId("PTA-2611-0042", secret);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(analyticsTransactionId("PTA-2611-0042", secret)).toBe(id);
    expect(analyticsTransactionId("PTA-2611-0043", secret)).not.toBe(id);
    expect(analyticsTransactionId("PTA-2611-0042", "y".repeat(40))).not.toBe(id);
    expect(id).not.toContain("2611");
  });

  it("is off without the secret", () => {
    expect(analyticsTransactionId("PTA-2611-0042")).toBeNull();
  });
});
