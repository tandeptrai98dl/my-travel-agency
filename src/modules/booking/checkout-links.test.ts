import { beforeEach, describe, expect, it, vi } from "vitest";

import { accessCookieName, signAccess } from "./booking-access";

const SECRET = "test-access-secret-0123456789abcdef";
const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  set: vi.fn(),
  findBookingIdByCode: vi.fn(),
  findLinkBooking: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (mocks.jar.has(name) ? { value: mocks.jar.get(name) } : undefined), set: mocks.set }),
}));
vi.mock("@/lib/env/server", () => ({ serverEnv: { BOOKING_ACCESS_SECRET: "test-access-secret-0123456789abcdef" } }));
vi.mock("./checkout.repository", () => ({ findBookingIdByCode: mocks.findBookingIdByCode, findLinkBooking: mocks.findLinkBooking }));
vi.mock("@/lib/auth/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(), rateLimitKey: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({ isTurnstileConfigured: vi.fn(), turnstileSiteKey: vi.fn(), verifyTurnstile: vi.fn() }));
vi.mock("@/modules/catalog/public/tour-public.service", () => ({ getTourDepartures: vi.fn(), getTourPage: vi.fn() }));
vi.mock("@/modules/content/public/content-public.service", () => ({ getPrivacyConsent: vi.fn() }));
vi.mock("@/modules/payment/payment.service", () => ({ availableMethods: vi.fn(), instructionsFor: vi.fn() }));
vi.mock("./booking.repository", () => ({}));
vi.mock("./booking.service", () => ({}));
vi.mock("./quote.service", async () => {
  const { createHash } = await import("node:crypto");
  return { hashLinkToken: (token: string) => createHash("sha256").update(token).digest("hex") };
});

const { emailLinkValid, openEmailLink, usedLinkCheckout } = await import("./checkout.service");

const booking = { id: "b-1", code: "PTA-2611-0042", locale: "en" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jar.clear();
  mocks.findBookingIdByCode.mockResolvedValue({ data: booking, error: null });
});

describe("emailed checkout links (4E)", () => {
  it("accept a token signed for this booking, without side effects", async () => {
    const token = signAccess(SECRET, "b-1").value;
    expect(await emailLinkValid("PTA-2611-0042", token)).toBe(true);
    expect(await emailLinkValid("PTA-2611-0042", signAccess(SECRET, "b-2").value)).toBe(false);
    expect(await emailLinkValid("PTA-2611-0042", signAccess("another-secret-0123456789abcdef", "b-1").value)).toBe(false);
    expect(await emailLinkValid("PTA-2611-0042", undefined)).toBe(false);
    expect(await emailLinkValid("not-a-code", token)).toBe(false);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("set the access cookie on the click, keeping the link's expiry", async () => {
    const signed = signAccess(SECRET, "b-1");
    expect(await openEmailLink("PTA-2611-0042", signed.value)).toEqual({ ok: true, code: "PTA-2611-0042", locale: "en" });
    expect(mocks.set).toHaveBeenCalledWith(accessCookieName("PTA-2611-0042"), signed.value, expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", expires: signed.expires }));
    mocks.set.mockClear();
    expect(await openEmailLink("PTA-2611-0042", signAccess(SECRET, "b-2").value)).toEqual({ ok: false });
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

describe("used payment links (#34 review)", () => {
  const token = "a".repeat(43);

  it("offer the checkout only to the browser holding that booking's cookie", async () => {
    mocks.findLinkBooking.mockResolvedValue({ data: { booking_id: "b-1", bookings: { code: "PTA-2611-0042", locale: "vi" } }, error: null });
    expect(await usedLinkCheckout(token)).toBeNull();
    mocks.jar.set(accessCookieName("PTA-2611-0042"), signAccess(SECRET, "b-2").value);
    expect(await usedLinkCheckout(token)).toBeNull();
    mocks.jar.set(accessCookieName("PTA-2611-0042"), signAccess(SECRET, "b-1").value);
    expect(await usedLinkCheckout(token)).toEqual({ code: "PTA-2611-0042" });
    expect(await usedLinkCheckout("short")).toBeNull();
  });
});
