import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Rate limits of the public forms (Phase 6 spec decision 1, Stream B's share of the security
 * review): the contact form, the newsletter sign-up, the tailor-made wizard, the private-tour
 * inquiry form and the cookie-consent record. Each form runs through its real Server Action, its
 * real service and the real `rateLimit()`; only Upstash is replaced, by an in-memory counter that
 * can also be switched off or made to fail. Two things are proved per form:
 * - an over-limit answer is honoured: the request past the limit is refused and writes nothing;
 * - the fail mode is ADR-029's: without Upstash, or with Upstash failing, the forms fail closed
 *   (nothing is written, Turnstile is not even asked), and the consent record is refused while the
 *   choice itself stays applied in the browser (`src/components/layout/consent-record.test.ts`
 *   and the E2E `tests/e2e/public-rate-limits.spec.ts`).
 * Booking creation and payment start fail open by design (ADR-033); they are Stream A's.
 */

const redis = vi.hoisted(() => ({
  mode: "up" as "up" | "down" | "unconfigured",
  counts: new Map<string, number>(),
  calls: 0,
}));

const mocks = vi.hoisted(() => ({
  createContactInquiry: vi.fn(),
  createTailorMadeInquiry: vi.fn(),
  requestSubscription: vi.fn(),
  insertConsent: vi.fn(),
  sendInquiryEmails: vi.fn(),
  sendEmail: vi.fn(),
  verifyTurnstile: vi.fn(),
  headers: new Map<string, string>(),
}));

vi.mock("@/lib/redis", () => ({
  isRedisConfigured: () => redis.mode !== "unconfigured",
  // Upstash's pipeline: INCR returns the new count, EXPIRE 1.
  redisPipeline: async (commands: (string | number)[][]) => {
    redis.calls += 1;
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
vi.mock("@/lib/turnstile", () => ({
  isTurnstileConfigured: () => true,
  turnstileSiteKey: () => "site-key",
  verifyTurnstile: mocks.verifyTurnstile,
}));
vi.mock("@/lib/env/public", () => ({
  publicEnv: { NEXT_PUBLIC_SITE_URL: "https://example.com", NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co" },
}));
vi.mock("@/lib/site-url", () => ({ siteUrl: new URL("https://example.com") }));
vi.mock("@/modules/notification/email.repository", () => ({ insertEmailLog: vi.fn() }));
vi.mock("@/modules/notification/email.service", async (original) => ({
  ...(await original<typeof import("@/modules/notification/email.service")>()),
  isEmailConfigured: () => true,
  sendEmail: mocks.sendEmail,
}));
vi.mock("@/modules/content/public/content-public.service", () => ({
  getPrivacyConsent: async (locale: string) => ({ href: `/${locale}/policies/privacy`, version: `privacy-${locale}-0123456789abcdef` }),
}));
vi.mock("@/modules/settings/settings.service", () => ({
  getPublicSettings: async () => ({ company: { name: "Brand" }, contact: null, social: {} }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string) => `${namespace}.${key}`,
}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (name: string) => mocks.headers.get(name) ?? null }) }));
vi.mock("@/modules/inquiry/contact.repository", () => ({ createContactInquiry: mocks.createContactInquiry }));
vi.mock("@/modules/inquiry/tailor-made.repository", () => ({ createTailorMadeInquiry: mocks.createTailorMadeInquiry }));
vi.mock("@/modules/inquiry/inquiry-emails.service", () => ({ sendInquiryEmails: mocks.sendInquiryEmails }));
vi.mock("@/modules/content/public/newsletter.repository", () => ({ requestSubscription: mocks.requestSubscription }));
vi.mock("@/modules/consent/consent.repository", () => ({ insertConsent: mocks.insertConsent }));

import { recordConsentChoice } from "@/modules/consent/consent.actions";
import { subscribeToNewsletter } from "@/modules/content/public/newsletter.actions";
import { sendContactMessage } from "@/modules/inquiry/contact.actions";
import { sendInquiry } from "@/modules/inquiry/tailor-made.actions";

const form = (entries: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const item of [value].flat()) data.append(key, item);
  return data;
};

const inquiryFields = (email: string) => ({
  locale: "en",
  adults: "2",
  name: "Anna",
  email,
  preferredContact: "email",
  consent: "on",
  "cf-turnstile-response": "token",
});

type PublicForm = {
  name: string;
  /** Submits once from this IP with this address; returns the action's status. */
  submit: (email: string) => Promise<string>;
  /** Rows the service-role write would have created. */
  writes: () => number;
  /** The status of an accepted request. */
  accepted: string;
  ipLimit: number;
  emailLimit?: number;
  /** Turnstile is checked (after the per-IP limit) on every form but the consent record. */
  turnstile: boolean;
};

const FORMS: PublicForm[] = [
  {
    name: "contact form",
    submit: async (email) =>
      (
        await sendContactMessage(
          { status: "idle" },
          form({ name: "Lan", email, preferredContact: "zalo", message: "Tôi muốn hỏi về tour Hạ Long.", consent: "on", locale: "vi", "cf-turnstile-response": "token" }),
        )
      ).status,
    writes: () => mocks.createContactInquiry.mock.calls.length,
    accepted: "sent",
    ipLimit: 5,
    emailLimit: 3,
    turnstile: true,
  },
  {
    name: "newsletter sign-up",
    submit: async (email) => (await subscribeToNewsletter({ status: "idle" }, form({ email, locale: "en", "cf-turnstile-response": "token" }))).status,
    writes: () => mocks.requestSubscription.mock.calls.length,
    accepted: "sent",
    ipLimit: 5,
    emailLimit: 3,
    turnstile: true,
  },
  {
    name: "tailor-made wizard",
    submit: async (email) =>
      (await sendInquiry({ status: "idle" }, form({ ...inquiryFields(email), source: "tailor_made", dest: ["vietnam", "japan"], travelMonth: "2027-03" }))).status,
    writes: () => mocks.createTailorMadeInquiry.mock.calls.filter(([input]) => input.source === "tailor_made").length,
    accepted: "sent",
    ipLimit: 5,
    emailLimit: 3,
    turnstile: true,
  },
  {
    name: "private-tour inquiry form",
    submit: async (email) => (await sendInquiry({ status: "idle" }, form({ ...inquiryFields(email), source: "tour_inquiry", tourCode: "VN-PRV-01" }))).status,
    writes: () => mocks.createTailorMadeInquiry.mock.calls.filter(([input]) => input.source === "tour_inquiry").length,
    accepted: "sent",
    ipLimit: 5,
    emailLimit: 3,
    turnstile: true,
  },
  {
    name: "cookie-consent record",
    submit: async () =>
      (await recordConsentChoice({ id: "0f8b9c1e-2d3a-4b5c-8d6e-7f8091a2b3c4", action: "custom", analytics: true, marketing: false, locale: "vi" })).status,
    writes: () => mocks.insertConsent.mock.calls.length,
    accepted: "recorded",
    ipLimit: 20,
    turnstile: false,
  },
];

const fromIp = (ip: string) => mocks.headers.set("x-forwarded-for", `${ip}, 10.0.0.1`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  redis.mode = "up";
  redis.counts.clear();
  redis.calls = 0;
  mocks.headers.clear();
  mocks.verifyTurnstile.mockResolvedValue(true);
  mocks.createContactInquiry.mockResolvedValue({ data: "INQ-2611-0001", error: null });
  mocks.createTailorMadeInquiry.mockResolvedValue({ data: { id: "11111111-1111-4111-8111-111111111111", code: "INQ-2611-0002" }, error: null });
  mocks.requestSubscription.mockResolvedValue({ data: true, error: null });
  mocks.insertConsent.mockResolvedValue({ error: null });
  mocks.sendEmail.mockResolvedValue("sent");
});

describe.each(FORMS)("$name", (subject) => {
  it("honours the per-IP limit: the request past it is refused and writes nothing", async () => {
    fromIp("203.0.113.7");
    for (let i = 0; i < subject.ipLimit; i += 1) expect(await subject.submit(`guest${i}@example.com`)).toBe(subject.accepted);
    expect(await subject.submit("guest-over@example.com")).toBe("rateLimited");
    expect(subject.writes()).toBe(subject.ipLimit);
    // The refused request never reached Turnstile either (the IP limit comes first).
    if (subject.turnstile) expect(mocks.verifyTurnstile).toHaveBeenCalledTimes(subject.ipLimit);
    // Another IP still gets through: the limit is per IP, not global.
    fromIp("198.51.100.4");
    expect(await subject.submit("someone@example.com")).toBe(subject.accepted);
  });

  if (subject.emailLimit) {
    const limit = subject.emailLimit;
    it("honours the per-address limit across IPs", async () => {
      for (let i = 0; i < limit; i += 1) {
        fromIp(`203.0.113.${10 + i}`);
        expect(await subject.submit("same@example.com")).toBe(subject.accepted);
      }
      fromIp("203.0.113.99");
      expect(await subject.submit("SAME@example.com")).toBe("rateLimited");
      expect(subject.writes()).toBe(limit);
    });
  }

  it("fails closed while Upstash fails: refused, nothing written, Turnstile not asked", async () => {
    redis.mode = "down";
    fromIp("203.0.113.7");
    expect(await subject.submit("guest@example.com")).toBe("unavailable");
    expect(redis.calls).toBeGreaterThan(0);
    expect(subject.writes()).toBe(0);
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendInquiryEmails).not.toHaveBeenCalled();
  });

  it("fails closed without Upstash configured", async () => {
    redis.mode = "unconfigured";
    fromIp("203.0.113.7");
    expect(await subject.submit("guest@example.com")).toBe("unavailable");
    expect(subject.writes()).toBe(0);
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
  });
});
