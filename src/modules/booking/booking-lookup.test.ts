import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issueBookingLookup: vi.fn(),
  sendBookingLookupEmail: vi.fn(),
  checkLimits: vi.fn(),
  checkTurnstile: vi.fn(),
  turnstileUsable: vi.fn(),
  onVercel: vi.fn(),
  isEmailConfigured: vi.fn(),
  after: vi.fn(),
}));
vi.mock("./booking-lookup.repository", () => ({ issueBookingLookup: mocks.issueBookingLookup }));
vi.mock("./booking-emails.service", () => ({ sendBookingLookupEmail: mocks.sendBookingLookupEmail }));
vi.mock("@/modules/identity/auth-guards", () => ({
  checkLimits: mocks.checkLimits,
  checkTurnstile: mocks.checkTurnstile,
  turnstileUsable: mocks.turnstileUsable,
  onVercel: mocks.onVercel,
}));
vi.mock("@/modules/notification/email.service", () => ({ isEmailConfigured: mocks.isEmailConfigured }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { bookingLookupSchema } = await import("./booking-lookup.schemas");
const { bookingLookupAvailable, issueAndSendLookup, requestBookingLookup } = await import("./booking-lookup.service");

const input = { code: "PTA-2611-0042", email: "anna@example.com", locale: "en" as const, turnstileToken: "tok" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkLimits.mockResolvedValue("ok");
  mocks.checkTurnstile.mockResolvedValue(true);
  mocks.turnstileUsable.mockReturnValue(true);
  mocks.onVercel.mockReturnValue(false);
  mocks.isEmailConfigured.mockReturnValue(false);
  mocks.sendBookingLookupEmail.mockResolvedValue("sent");
});

describe("booking lookup", () => {
  it("normalises the code and the address", () => {
    expect(bookingLookupSchema.parse({ code: " pta-2611-0042 ", email: " Anna@Example.COM ", locale: "vi" })).toMatchObject({
      code: "PTA-2611-0042",
      email: "anna@example.com",
    });
    expect(bookingLookupSchema.safeParse({ code: "PTA-26-1", email: "a@b.co", locale: "vi" }).error?.issues[0]?.message).toBe("invalidCode");
  });

  it("answers the same before any lookup, and does the work after the response", async () => {
    expect(await requestBookingLookup(input, { ip: "203.0.113.7" })).toEqual({ status: "sent" });
    expect(mocks.issueBookingLookup).not.toHaveBeenCalled();
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.checkLimits.mock.calls.map(([limits]) => limits[0])).toEqual([
      { scope: "lookup-ip", id: "203.0.113.7", limit: 5, window: 600 },
      { scope: "lookup-code", id: "PTA-2611-0042", limit: 3, window: 600 },
    ]);
    // Both limits fail closed (no failOpen option).
    expect(mocks.checkLimits.mock.calls.every((call) => call.length === 1)).toBe(true);
  });

  it("refuses over the limits, without Turnstile, and when it cannot work", async () => {
    mocks.checkLimits.mockResolvedValueOnce("rate_limited");
    expect(await requestBookingLookup(input, { ip: null })).toEqual({ status: "rate_limited" });
    mocks.checkTurnstile.mockResolvedValueOnce(false);
    expect(await requestBookingLookup(input, { ip: null })).toEqual({ status: "turnstile" });
    mocks.checkLimits.mockResolvedValueOnce("ok").mockResolvedValueOnce("unavailable");
    expect(await requestBookingLookup(input, { ip: null })).toEqual({ status: "unavailable" });
    expect(mocks.after).not.toHaveBeenCalled();
    mocks.onVercel.mockReturnValue(true);
    expect(bookingLookupAvailable()).toBe(false);
    mocks.isEmailConfigured.mockReturnValue(true);
    expect(bookingLookupAvailable()).toBe(true);
    mocks.turnstileUsable.mockReturnValue(false);
    expect(await requestBookingLookup(input, { ip: null })).toEqual({ status: "unavailable" });
  });

  it("emails a fresh token only when the details matched, storing only its hash", async () => {
    mocks.issueBookingLookup.mockResolvedValueOnce({ data: null, error: null });
    expect(await issueAndSendLookup(input.code, input.email)).toBe("no_match");
    expect(mocks.sendBookingLookupEmail).not.toHaveBeenCalled();

    mocks.issueBookingLookup.mockResolvedValueOnce({ data: { token_id: "t-1", booking_id: "b-1", expires_at: "2026-11-07T10:30:00Z" }, error: null });
    expect(await issueAndSendLookup(input.code, input.email)).toBe("sent");
    const [, , hash] = mocks.issueBookingLookup.mock.calls[1]!;
    const sent = mocks.sendBookingLookupEmail.mock.calls[0]![0];
    expect(sent).toMatchObject({ bookingId: "b-1", tokenId: "t-1", expiresAt: "2026-11-07T10:30:00Z" });
    expect(sent.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(createHash("sha256").update(sent.token).digest("hex"));
    expect(hash).not.toContain(sent.token);
  });

  it("logs failures without throwing", async () => {
    mocks.issueBookingLookup.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    expect(await issueAndSendLookup(input.code, input.email)).toBe("failed");
    mocks.issueBookingLookup.mockRejectedValueOnce(new Error("boom"));
    expect(await issueAndSendLookup(input.code, input.email)).toBe("failed");
  });
});
