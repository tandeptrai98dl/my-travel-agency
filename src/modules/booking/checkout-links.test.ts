import { beforeEach, describe, expect, it, vi } from "vitest";

import { accessCookieName, signAccess } from "./booking-access";

const SECRET = "test-access-secret-0123456789abcdef";
const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  set: vi.fn(),
  accessTokenState: vi.fn(),
  redeemAccessToken: vi.fn(),
  findLinkBooking: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (mocks.jar.has(name) ? { value: mocks.jar.get(name) } : undefined), set: mocks.set }),
}));
vi.mock("@/lib/env/server", () => ({ serverEnv: { BOOKING_ACCESS_SECRET: "test-access-secret-0123456789abcdef" } }));
vi.mock("./checkout.repository", () => ({
  accessTokenState: mocks.accessTokenState,
  redeemAccessToken: mocks.redeemAccessToken,
  findLinkBooking: mocks.findLinkBooking,
}));
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

const { emailLinkState, openEmailLink, usedLinkCheckout } = await import("./checkout.service");
const { verifyAccess } = await import("./booking-access");
const { createHash } = await import("node:crypto");

const TOKEN = "e".repeat(43);
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jar.clear();
});

describe("emailed checkout links (4E, single use: ADR-038)", () => {
  it("report the token's state for the booking in the URL, without side effects", async () => {
    mocks.accessTokenState.mockResolvedValue({ data: "valid", error: null });
    expect(await emailLinkState("PTA-2611-0042", TOKEN)).toBe("valid");
    expect(mocks.accessTokenState).toHaveBeenCalledWith("PTA-2611-0042", hash(TOKEN));
    mocks.accessTokenState.mockResolvedValue({ data: "used", error: null });
    expect(await emailLinkState("PTA-2611-0042", TOKEN)).toBe("used");
    mocks.accessTokenState.mockResolvedValue({ data: "weird", error: null });
    expect(await emailLinkState("PTA-2611-0042", TOKEN)).toBe("invalid");
    mocks.accessTokenState.mockClear();
    expect(await emailLinkState("PTA-2611-0042", undefined)).toBe("invalid");
    expect(await emailLinkState("PTA-2611-0042", "short")).toBe("invalid");
    expect(await emailLinkState("not-a-code", TOKEN)).toBe("invalid");
    expect(mocks.accessTokenState).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("use the token once on the click and set a fresh signed cookie, never the emailed token", async () => {
    mocks.redeemAccessToken.mockResolvedValue({ data: { booking_id: "b-1", code: "PTA-2611-0042", locale: "en" }, error: null });
    expect(await openEmailLink("PTA-2611-0042", TOKEN)).toEqual({ ok: true, code: "PTA-2611-0042", locale: "en" });
    expect(mocks.redeemAccessToken).toHaveBeenCalledWith("PTA-2611-0042", hash(TOKEN));
    const [name, value, options] = mocks.set.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(name).toBe(accessCookieName("PTA-2611-0042"));
    expect(value).not.toBe(TOKEN);
    expect(verifyAccess(SECRET, "b-1", value)).toBe(true);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("refuse used, expired and unknown tokens and set nothing", async () => {
    for (const [message, error] of [["link_used", "used"], ["link_expired", "expired"], ["link_invalid", "invalid"]] as const) {
      mocks.redeemAccessToken.mockResolvedValueOnce({ data: null, error: { code: "P0001", message } });
      expect(await openEmailLink("PTA-2611-0042", TOKEN)).toEqual({ ok: false, error });
    }
    expect(await openEmailLink("PTA-2611-0042", "bad")).toEqual({ ok: false, error: "invalid" });
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
