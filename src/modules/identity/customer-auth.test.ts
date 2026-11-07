import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/server", () => ({
  validatedPublicEnv: {
    NEXT_PUBLIC_SITE_URL: "https://travel.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  },
  serverEnv: { SUPABASE_SECRET_KEY: "sb_secret_test", GOOGLE_OAUTH_ENABLED: false },
}));
const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
vi.mock("@/lib/logger", () => ({ logger }));

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string | { name: string }) => void cookieJar.delete(typeof name === "string" ? name : name.name),
  }),
  headers: async () => new Headers(),
}));

const rpc = vi.fn();
const auth = {
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  signUp: vi.fn(),
  updateUser: vi.fn(),
};
let profileRow: unknown = null;
const supabase = {
  auth,
  rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow, error: null }) }) }) }),
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
const adminRpc = vi.fn(async () => ({ data: null, error: null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: adminRpc }) }));
const getPrivacyConsent = vi.fn(async () => ({ href: "/chinh-sach/bao-mat", version: "privacy-vi-0123456789abcdef" }));
vi.mock("@/modules/content/public/content-public.service", () => ({ getPrivacyConsent }));
const guards = {
  checkLimits: vi.fn(async () => "ok"),
  checkTurnstile: vi.fn(async () => true),
  turnstileUsable: vi.fn(() => true),
};
vi.mock("./auth-guards", () => guards);

const settings = await import("./auth-settings");
const service = await import("./customer-auth.service");
const marker = await import("./recovery-marker");
const schemas = await import("./customer-auth.schemas");

const settingsResponse = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);

beforeEach(() => {
  vi.clearAllMocks();
  settings.resetConfirmationGuardCache();
  cookieJar.clear();
  profileRow = { id: "00000000-0000-4000-8000-000000000001", role: "customer", locale: "vi", is_active: true, deleted_at: null };
  auth.getUser.mockResolvedValue({ data: { user: { id: "00000000-0000-4000-8000-000000000001", email: "a@example.test" } }, error: null });
  rpc.mockResolvedValue({ data: 2, error: null });
});

describe("email confirmation guard (decision 6, review M1)", () => {
  it("is ok only when GoTrue reports mailer_autoconfirm false", async () => {
    expect(await settings.readConfirmationGuard(settingsResponse({ mailer_autoconfirm: false }))).toEqual({ ok: true });
    expect(await settings.readConfirmationGuard(settingsResponse({ mailer_autoconfirm: true }))).toEqual({ ok: false, reason: "autoconfirm" });
  });

  it("fails closed when the settings cannot be read or look odd", async () => {
    expect(await settings.readConfirmationGuard(settingsResponse({}, false))).toEqual({ ok: false, reason: "unreachable" });
    expect(await settings.readConfirmationGuard(settingsResponse({}))).toEqual({ ok: false, reason: "unreachable" });
    expect(await settings.readConfirmationGuard(settingsResponse({ mailer_autoconfirm: "false" }))).toEqual({ ok: false, reason: "unreachable" });
    const throwing = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await settings.readConfirmationGuard(throwing)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reads GoTrue's public settings with the publishable key", async () => {
    const fetcher = settingsResponse({ mailer_autoconfirm: false });
    await settings.readConfirmationGuard(fetcher);
    expect(fetcher).toHaveBeenCalledWith("https://project.supabase.co/auth/v1/settings", expect.objectContaining({ headers: { apikey: "sb_publishable_x" } }));
  });

  it("caches for five minutes and logs a refusal once per period", async () => {
    const fetcher = settingsResponse({ mailer_autoconfirm: true });
    await settings.confirmationGuard(0, fetcher);
    await settings.confirmationGuard(60_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("auth.autoconfirm_guard", expect.objectContaining({ reason: "autoconfirm" }));
    await settings.confirmationGuard(6 * 60_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("attaches nothing while emails are auto-confirmed", async () => {
    await settings.confirmationGuard(undefined, settingsResponse({ mailer_autoconfirm: true }));
    expect(await service.attachEarlierBookings(supabase as never)).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("attaches nothing when the settings are unreachable", async () => {
    await settings.confirmationGuard(undefined, settingsResponse({}, false));
    expect(await service.attachEarlierBookings(supabase as never)).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("attaches when confirmations are on", async () => {
    await settings.confirmationGuard(undefined, settingsResponse({ mailer_autoconfirm: false }));
    expect(await service.attachEarlierBookings(supabase as never)).toBe(2);
    expect(rpc).toHaveBeenCalledWith("attach_customer_bookings");
  });

  it("disables sign-up while emails are auto-confirmed", async () => {
    await settings.confirmationGuard(undefined, settingsResponse({ mailer_autoconfirm: true }));
    expect((await service.signUpAvailability("vi")).enabled).toBe(false);
    const result = await service.signUp(
      { fullName: "A", email: "a@example.test", password: "long-enough-1", privacy: "on", marketing: false, locale: "vi", turnstileToken: "" },
      { ip: null, userAgent: null, turnstileToken: "" },
    );
    expect(result).toEqual({ status: "unavailable" });
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe("sign-up", () => {
  const input = { fullName: "A", email: "a@example.test", password: "long-enough-1", privacy: "on" as const, marketing: true, locale: "vi" as const, turnstileToken: "" };
  const meta = { ip: "203.0.113.1", userAgent: "UA", turnstileToken: "t" };

  beforeEach(async () => {
    await settings.confirmationGuard(undefined, settingsResponse({ mailer_autoconfirm: false }));
  });

  it("is off without a published privacy policy (ADR-035)", async () => {
    getPrivacyConsent.mockResolvedValueOnce(null as never);
    expect(await service.signUp(input, meta)).toEqual({ status: "unavailable" });
  });

  it("records consent for a new account and answers 'check your email'", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: { id: "u1", identities: [{}] }, session: null }, error: null });
    expect(await service.signUp(input, meta)).toEqual({ status: "sent" });
    expect(adminRpc).toHaveBeenCalledWith("record_signup_consent", expect.objectContaining({ target_id: "u1", privacy_version: "privacy-vi-0123456789abcdef", marketing: true }));
  });

  it("answers the same for an existing address and records nothing", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: { id: "obfuscated", identities: [] }, session: null }, error: null });
    expect(await service.signUp(input, meta)).toEqual({ status: "sent" });
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("refuses without Turnstile and before calling GoTrue", async () => {
    guards.checkTurnstile.mockResolvedValueOnce(false);
    expect(await service.signUp(input, meta)).toEqual({ status: "turnstile" });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("refuses when a fail-closed limit is unavailable", async () => {
    guards.checkLimits.mockResolvedValueOnce("unavailable");
    expect(await service.signUp(input, meta)).toEqual({ status: "unavailable" });
  });
});

describe("sign-in", () => {
  beforeEach(async () => {
    await settings.confirmationGuard(undefined, settingsResponse({ mailer_autoconfirm: false }));
  });

  it("sends customers to next (same site only) or their account, and attaches bookings", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    expect(await service.signIn({ email: "a@example.test", password: "x", locale: "vi", next: "/tai-khoan/booking", surface: "customer" }, { ip: null, userAgent: null })).toEqual({
      status: "redirect",
      to: "/tai-khoan/booking",
    });
    expect(rpc).toHaveBeenCalledWith("attach_customer_bookings");
    expect(await service.signIn({ email: "a@example.test", password: "x", locale: "en", next: "//evil.example", surface: "customer" }, { ip: null, userAgent: null })).toEqual({
      status: "redirect",
      to: "/en/account",
    });
  });

  it("sends staff to the admin without attaching anything", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    profileRow = { id: "s", role: "sales", locale: "vi", is_active: true, deleted_at: null };
    expect(await service.signIn({ email: "s@example.test", password: "x", locale: "vi", next: "/tai-khoan", surface: "customer" }, { ip: null, userAgent: null })).toEqual({
      status: "redirect",
      to: "/admin",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("signs a deactivated profile out again", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    profileRow = { id: "x", role: "customer", locale: "vi", is_active: false, deleted_at: null };
    expect(await service.signIn({ email: "x@example.test", password: "x", locale: "vi", next: "", surface: "customer" }, { ip: null, userAgent: null })).toEqual({ status: "invalid_credentials" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("maps GoTrue errors", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: { code: "invalid_credentials", status: 400 } });
    expect((await service.signIn({ email: "a@example.test", password: "x", locale: "vi", next: "", surface: "customer" }, { ip: null, userAgent: null })).status).toBe("invalid_credentials");
    auth.signInWithPassword.mockResolvedValueOnce({ error: { code: "email_not_confirmed", status: 400 } });
    expect((await service.signIn({ email: "a@example.test", password: "x", locale: "vi", next: "", surface: "customer" }, { ip: null, userAgent: null })).status).toBe("unconfirmed");
  });

  it("uses fail-open limits per IP and per email", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    await service.signIn({ email: "a@example.test", password: "x", locale: "vi", next: "", surface: "customer" }, { ip: "203.0.113.1", userAgent: null });
    expect(guards.checkLimits).toHaveBeenCalledWith(
      [expect.objectContaining({ scope: "signin-ip", id: "203.0.113.1" }), expect.objectContaining({ scope: "signin-email", id: "a@example.test", limit: 5 })],
      { failOpen: true },
    );
  });
});

describe("landingFor", () => {
  it("never sends a customer into the admin or the staff pages", () => {
    expect(service.landingFor("customer", "vi", "/admin")).toBe("/tai-khoan");
    expect(service.landingFor("customer", "vi", "/auth/login")).toBe("/tai-khoan");
    expect(service.landingFor("customer", "en", "/en/checkout/PTA-2611-0001")).toBe("/en/checkout/PTA-2611-0001");
    expect(service.landingFor("admin", "en", "/en/account")).toBe("/admin");
  });
});

describe("password reset (decision 1, review m4)", () => {
  it("refuses a session without the recovery marker", async () => {
    expect(await service.completePasswordReset({ password: "long-enough-1", confirm: "long-enough-1", locale: "vi" })).toEqual({ status: "expired" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("sets the password, signs other sessions out and clears the marker", async () => {
    await service.markRecoverySession("00000000-0000-4000-8000-000000000001");
    auth.updateUser.mockResolvedValueOnce({ error: null });
    expect(await service.completePasswordReset({ password: "long-enough-1", confirm: "long-enough-1", locale: "vi" })).toEqual({ status: "redirect", to: "/tai-khoan" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(cookieJar.has(marker.RECOVERY_COOKIE)).toBe(false);
  });

  it("refuses another user's marker", async () => {
    await service.markRecoverySession("00000000-0000-4000-8000-000000000009");
    expect((await service.completePasswordReset({ password: "long-enough-1", confirm: "long-enough-1", locale: "vi" })).status).toBe("expired");
  });
});

describe("recovery marker", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("verifies for the same user before it expires", () => {
    const { value } = marker.signRecoveryMarker("secret", id, 1_800_000_000_000);
    expect(marker.verifyRecoveryMarker("secret", id, value, 1_800_000_000_000 + 60_000)).toBe(true);
    expect(marker.verifyRecoveryMarker("secret", id, value, 1_800_000_000_000 + 16 * 60_000)).toBe(false);
    expect(marker.verifyRecoveryMarker("other", id, value, 1_800_000_000_000)).toBe(false);
    expect(marker.verifyRecoveryMarker("secret", "00000000-0000-4000-8000-000000000002", value, 1_800_000_000_000)).toBe(false);
    expect(marker.verifyRecoveryMarker("secret", id, `${value}x`, 1_800_000_000_000)).toBe(false);
    expect(marker.verifyRecoveryMarker("secret", id, undefined)).toBe(false);
  });
});

describe("schemas", () => {
  it("needs a 10-character password and the privacy consent at sign-up", () => {
    const base = { fullName: "A", email: "A@Example.test ", password: "short", locale: "vi" };
    const parsed = schemas.signUpSchema.safeParse(base);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(schemas.fieldErrors(parsed.error.issues)).toEqual({ password: "passwordTooShort", privacy: "consentRequired" });
    const ok = schemas.signUpSchema.parse({ ...base, password: "long-enough-1", privacy: "on" });
    expect(ok.email).toBe("a@example.test");
    expect(ok.marketing).toBe(false);
  });

  it("refuses a password over 72 bytes and mismatched confirmations", () => {
    expect(schemas.newPasswordSchema.safeParse({ password: "ữ".repeat(30), confirm: "ữ".repeat(30), locale: "vi" }).success).toBe(false);
    const mismatch = schemas.newPasswordSchema.safeParse({ password: "long-enough-1", confirm: "long-enough-2", locale: "vi" });
    expect(mismatch.success).toBe(false);
  });
});
