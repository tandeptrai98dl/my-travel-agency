import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Rate limits of the secure flows (Phase 6 spec decision 1, Stream A's share of the review; the
 * public forms are in rate-limit.public-forms.test.ts): booking creation, payment start and the
 * auth guard that sign-in, sign-up, password reset, resend, email and password changes and the
 * guest booking lookup go through (`checkLimits()`). The real `rateLimit()` runs against an
 * in-memory Upstash that can also be down or missing. Per flow: the request past the limit is
 * refused and writes nothing, and the fail mode is the documented one: booking creation, payment
 * start and sign-in fail open (logged, ADR-033, Phase 5 decision 2); the other auth forms and the
 * lookup fail closed. Which limit each auth form passes, and with which fail mode, is asserted in
 * customer-auth.test.ts, booking-lookup.test.ts and account-deletion.test.ts.
 */

const redis = vi.hoisted(() => ({ mode: "up" as "up" | "down" | "unconfigured", counts: new Map<string, number>() }));
const env = vi.hoisted(() => ({ VERCEL_ENV: undefined as string | undefined, BOOKING_ACCESS_SECRET: "x".repeat(40) }));
const mocks = vi.hoisted(() => ({
  createCheckoutDraft: vi.fn(),
  startPayment: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/redis", () => ({
  isRedisConfigured: () => redis.mode !== "unconfigured",
  redisPipeline: async (commands: (string | number)[][]) => {
    if (redis.mode === "unconfigured") return { configured: false };
    if (redis.mode === "down") return { configured: true, ok: false };
    const results = commands.map(([command, key]) => {
      if (command !== "INCR") return 1;
      const next = (redis.counts.get(String(key)) ?? 0) + 1;
      redis.counts.set(String(key), next);
      return next;
    });
    return { configured: true, ok: true, results };
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env/server", () => ({ serverEnv: env, validatedPublicEnv: {} }));
vi.mock("@/lib/turnstile", () => ({ isTurnstileConfigured: () => false, turnstileSiteKey: () => null, verifyTurnstile: vi.fn(async () => true) }));
vi.mock("@/lib/auth/get-user", () => ({ getCurrentUser: async () => null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }), headers: async () => new Headers() }));
vi.mock("@/modules/catalog/public/tour-public.service", () => ({ getTourDepartures: vi.fn(), getTourPage: vi.fn() }));
vi.mock("@/modules/content/public/content-public.service", () => ({
  getPrivacyConsent: async () => ({ href: "/chinh-sach/bao-mat", version: "privacy-vi-0123456789abcdef" }),
}));
vi.mock("@/modules/payment/payment.service", () => ({ availableMethods: async () => ["bank_transfer"], instructionsFor: vi.fn() }));
vi.mock("@/modules/booking/booking.repository", () => ({ createCheckoutDraft: mocks.createCheckoutDraft }));
vi.mock("@/modules/booking/checkout.repository", () => ({
  findPublishedTerms: async () => ({ data: null }),
  findBookingCode: async () => ({ data: { code: "PTA-2611-0042" } }),
}));
vi.mock("@/modules/booking/booking.service", () => ({
  buildDraft: async () => ({ ok: true, payload: {} }),
  mapBookingError: () => "failed",
  quote: vi.fn(),
  repriceStaleDraft: vi.fn(),
  startPayment: mocks.startPayment,
}));
vi.mock("@/modules/booking/quote.service", () => ({ hashLinkToken: vi.fn() }));

const { createCheckoutBooking, startCheckoutPayment } = await import("@/modules/booking/checkout.service");
const { checkLimits } = await import("@/modules/identity/auth-guards");

const context = { ip: "203.0.113.7", userAgent: null };
const values = { locale: "vi", turnstileToken: "", marketing: false } as unknown as Parameters<typeof createCheckoutBooking>[0];
const view = { id: "b-1", status: "draft", dueNow: { kind: "full", amount: 1_000_000 } } as unknown as Parameters<typeof startCheckoutPayment>[0];

beforeEach(() => {
  vi.clearAllMocks();
  redis.mode = "up";
  redis.counts.clear();
  env.VERCEL_ENV = undefined;
  mocks.createCheckoutDraft.mockResolvedValue({ data: "b-1", error: null });
  mocks.startPayment.mockResolvedValue({ ok: false, error: "sold_out" });
});

describe("booking creation (10 drafts per IP per 10 minutes, fails open)", () => {
  it("refuses the 11th draft from one IP and writes nothing for it", async () => {
    for (let i = 0; i < 10; i++) expect(await createCheckoutBooking(values, context)).toEqual({ ok: true, code: "PTA-2611-0042" });
    expect(await createCheckoutBooking(values, context)).toEqual({ ok: false, error: "rate_limited" });
    expect(mocks.createCheckoutDraft).toHaveBeenCalledTimes(10);
    // Another IP has its own window.
    expect((await createCheckoutBooking(values, { ...context, ip: "198.51.100.1" })).ok).toBe(true);
  });

  it("goes on when Upstash is down or missing, and logs it", async () => {
    for (const mode of ["down", "unconfigured"] as const) {
      redis.mode = mode;
      expect((await createCheckoutBooking(values, context)).ok).toBe(true);
    }
    expect(mocks.warn).toHaveBeenCalledWith("rate_limit.fail_open", expect.objectContaining({ scope: "booking-draft" }));
  });
});

describe("payment start (10 per IP and 5 per booking per 10 minutes, fails open)", () => {
  it("refuses the 6th start for one booking before any seat is held", async () => {
    for (let i = 0; i < 5; i++) expect(await startCheckoutPayment(view, "bank_transfer", { ...context, ip: `198.51.100.${i}` })).toEqual({ ok: false, error: "sold_out" });
    expect(await startCheckoutPayment(view, "bank_transfer", { ...context, ip: "198.51.100.9" })).toEqual({ ok: false, error: "rate_limited" });
    expect(mocks.startPayment).toHaveBeenCalledTimes(5);
  });

  it("refuses the 11th start from one IP across bookings", async () => {
    for (let i = 0; i < 10; i++) await startCheckoutPayment({ ...view, id: `b-${i}` }, "bank_transfer", context);
    expect(await startCheckoutPayment({ ...view, id: "b-x" }, "bank_transfer", context)).toEqual({ ok: false, error: "rate_limited" });
    expect(mocks.startPayment).toHaveBeenCalledTimes(10);
  });

  it("goes on when Upstash is down, and logs it", async () => {
    redis.mode = "down";
    await startCheckoutPayment(view, "bank_transfer", context);
    expect(mocks.startPayment).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledWith("rate_limit.fail_open", expect.objectContaining({ scope: "booking-pay" }));
  });
});

describe("the auth guard (sign-in, sign-up, reset, lookup and the account changes)", () => {
  const signupEmail = [{ scope: "signup-email", id: "a@example.test", limit: 3, window: 86_400 }];

  it("refuses past the limit", async () => {
    env.VERCEL_ENV = "preview";
    for (let i = 0; i < 3; i++) expect(await checkLimits(signupEmail)).toBe("ok");
    expect(await checkLimits(signupEmail)).toBe("rate_limited");
  });

  it("fails closed on Vercel when Upstash is down or missing, unless the form fails open (sign-in)", async () => {
    env.VERCEL_ENV = "production";
    for (const mode of ["down", "unconfigured"] as const) {
      redis.mode = mode;
      expect(await checkLimits(signupEmail)).toBe("unavailable");
      expect(await checkLimits([{ scope: "signin-ip", id: "203.0.113.7", limit: 10, window: 600 }], { failOpen: true })).toBe("ok");
    }
  });

  it("skips limits only off Vercel without Upstash (local and CI)", async () => {
    redis.mode = "unconfigured";
    expect(await checkLimits(signupEmail)).toBe("ok");
    expect(mocks.warn).toHaveBeenCalledWith("auth.rate_limits_skipped", { reason: "no_upstash_off_vercel" });
    // A configured Upstash is always used, also off Vercel.
    redis.mode = "up";
    for (let i = 0; i < 3; i++) await checkLimits(signupEmail);
    expect(await checkLimits(signupEmail)).toBe("rate_limited");
  });
});
