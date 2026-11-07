import { describe, expect, it } from "vitest";

import { accessCookieName, signAccess, verifyAccess } from "./booking-access";

const SECRET = "a-test-secret-that-is-long-enough-123";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const NOW = Date.UTC(2026, 10, 7, 3, 0, 0);

describe("booking access cookie", () => {
  it("names one cookie per booking from its code", () => {
    expect(accessCookieName("PTA-2611-0042")).toBe("booking_access_PTA26110042");
  });

  it("accepts its own token for 7 days and nothing else", () => {
    const { value, expires } = signAccess(SECRET, ID, NOW);
    expect(expires.getTime() - NOW).toBe(7 * 86_400_000);
    expect(verifyAccess(SECRET, ID, value, NOW)).toBe(true);
    expect(verifyAccess(SECRET, ID, value, NOW + 7 * 86_400_000 + 1)).toBe(false);
    expect(verifyAccess(SECRET, "11111111-1111-4111-8111-111111111111", value, NOW)).toBe(false);
    expect(verifyAccess("another-secret-that-is-long-enough-xx", ID, value, NOW)).toBe(false);
    expect(verifyAccess(SECRET, ID, undefined, NOW)).toBe(false);
    expect(verifyAccess(SECRET, ID, "garbage", NOW)).toBe(false);
  });

  it("refuses an expiry moved into the future (the HMAC covers it)", () => {
    const { value } = signAccess(SECRET, ID, NOW);
    const [expires, sig] = value.split(".");
    expect(verifyAccess(SECRET, ID, `${Number(expires) + 1000}.${sig}`, NOW)).toBe(false);
    // An expiry further out than 7 days is refused even with a valid MAC for it.
    const far = signAccess(SECRET, ID, NOW + 30 * 86_400_000);
    expect(verifyAccess(SECRET, ID, far.value, NOW)).toBe(false);
  });
});
