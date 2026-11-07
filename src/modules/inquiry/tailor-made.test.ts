import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  sendInquiryEmails: vi.fn(),
  privacyVersion: "privacy-en-0123456789abcdef" as string | null,
  rateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  configured: { turnstile: true, redis: true, email: true },
  headers: new Map<string, string>([["x-forwarded-for", "203.0.113.9, 10.0.0.1"], ["user-agent", "UA"]]),
}));

vi.mock("./tailor-made.repository", () => ({ createTailorMadeInquiry: mocks.create }));
vi.mock("./contact.repository", () => ({ createContactInquiry: vi.fn() }));
vi.mock("./inquiry-emails.service", () => ({ sendInquiryEmails: mocks.sendInquiryEmails }));
vi.mock("@/modules/content/public/content-public.service", () => ({
  getPrivacyConsent: async (locale: string) => (mocks.privacyVersion ? { href: `/${locale}/policies/privacy`, version: mocks.privacyVersion } : null),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, rateLimitKey: (scope: string, id: string) => `rl:${scope}:${id}` }));
vi.mock("@/lib/redis", () => ({ isRedisConfigured: () => mocks.configured.redis }));
vi.mock("@/lib/turnstile", () => ({
  isTurnstileConfigured: () => mocks.configured.turnstile,
  turnstileSiteKey: () => "site-key",
  verifyTurnstile: mocks.verifyTurnstile,
}));
vi.mock("@/modules/notification/email.repository", () => ({ insertEmailLog: vi.fn() }));
vi.mock("@/modules/notification/email.service", async (original) => ({
  ...(await original<typeof import("@/modules/notification/email.service")>()),
  isEmailConfigured: () => mocks.configured.email,
}));
vi.mock("@/modules/settings/settings.service", () => ({ getPublicSettings: async () => ({ company: null, contact: null, social: {} }) }));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));

import { sendInquiry } from "./tailor-made.actions";
import { inquiryPayload, inquirySchema } from "./tailor-made.schemas";

const wizard: [string, string][] = [
  ["source", "tailor_made"],
  ["locale", "en"],
  ["dest", "vietnam"],
  ["dest", "japan"],
  ["destinationsOther", "Laos"],
  ["travelMonth", "2027-03"],
  ["durationDays", "12"],
  ["adults", "2"],
  ["children", "1"],
  ["budget", "100_200m"],
  ["travelStyle", "honeymoon"],
  ["name", " Anna "],
  ["email", "Anna@Example.com"],
  ["phone", ""],
  ["preferredContact", "whatsapp"],
  ["companyName", ""],
  ["country", "United Kingdom"],
  ["message", ""],
  ["utm_source", "newsletter"],
  ["utm_medium", ""],
  ["consent", "on"],
  ["cf-turnstile-response", "token"],
];
const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
};
const without = (name: string) => wizard.filter(([key]) => key !== name);
const replace = (name: string, value: string): [string, string][] => [...without(name), [name, value]];

beforeEach(() => {
  mocks.sendInquiryEmails.mockReset();
  mocks.create.mockReset().mockResolvedValue({ data: { id: "11111111-1111-4111-8111-111111111111", code: "INQ-2611-0007" }, error: null });
  mocks.rateLimit.mockReset().mockResolvedValue("ok");
  mocks.verifyTurnstile.mockReset().mockResolvedValue(true);
  mocks.configured = { turnstile: true, redis: true, email: true };
  mocks.privacyVersion = "privacy-en-0123456789abcdef";
});

describe("inquiry schema", () => {
  it("maps the wizard to the function's payload", () => {
    const input = inquirySchema.parse({
      source: "tailor_made",
      locale: "en",
      destinations: ["vietnam"],
      destinationsOther: " ",
      travelMonth: "",
      flexibleDates: true,
      durationDays: "",
      adults: "2",
      name: "Anna",
      email: "anna@example.com",
      phone: "",
      consent: "on",
      utm: { source: "x", bogus: "y" },
    });
    expect(inquiryPayload(input)).toMatchObject({
      source: "tailor_made",
      destination_keys: ["vietnam"],
      destinations_other: null,
      travel_month: null,
      duration_days: null,
      adults: 2,
      children: 0,
      budget_per_person: null,
      travel_style: null,
      preferred_contact: "email",
      utm: {},
    });
  });

  it("refuses bad keys, months, parties and budgets", () => {
    const base = { source: "tailor_made", locale: "vi", adults: "2", name: "A", email: "a@example.com", consent: "on" };
    expect(inquirySchema.safeParse({ ...base, destinations: ["Việt Nam"] }).success).toBe(false);
    expect(inquirySchema.safeParse({ ...base, travelMonth: "2027-13" }).success).toBe(false);
    expect(inquirySchema.safeParse({ ...base, adults: "0" }).success).toBe(false);
    expect(inquirySchema.safeParse({ ...base, budget: "cheap" }).success).toBe(false);
    expect(inquirySchema.safeParse({ ...base, source: "contact" }).success).toBe(false);
    expect(inquirySchema.safeParse({ ...base, durationDays: "61" }).success).toBe(false);
  });
});

describe("sendInquiry", () => {
  it("saves a valid wizard with the published privacy version, the client IP and campaign tags", async () => {
    expect(await sendInquiry({ status: "idle" }, form(wizard))).toEqual({ status: "sent", code: "INQ-2611-0007" });
    const [input, version, ip, ua] = mocks.create.mock.calls[0];
    expect(input).toMatchObject({ destinations: ["vietnam", "japan"], flexibleDates: false, durationDays: 12, adults: 2, children: 1, name: "Anna", email: "anna@example.com", utm: { source: "newsletter" } });
    expect([version, ip, ua]).toEqual(["privacy-en-0123456789abcdef", "203.0.113.9", "UA"]);
    expect(mocks.rateLimit.mock.calls.map(([keys]) => keys[0])).toEqual(["rl:inquiry-ip:203.0.113.9", "rl:inquiry-email:anna@example.com"]);
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith("token", { action: "inquiry", ip: "203.0.113.9" });
    // After the write: the acknowledgement and the team alert, by inquiry id.
    expect(mocks.sendInquiryEmails).toHaveBeenCalledTimes(1);
    expect(mocks.sendInquiryEmails).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  it("returns field errors without saving", async () => {
    const state = await sendInquiry({ status: "idle" }, form(replace("email", "nope")));
    expect(state.status).toBe("invalid");
    expect(state.errors?.email).toBe("invalidEmail");
    const noConsent = await sendInquiry({ status: "idle" }, form(without("consent")));
    expect(noConsent.errors?.consent).toBe("consentRequired");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("answers a filled honeypot as sent and saves nothing", async () => {
    expect(await sendInquiry({ status: "idle" }, form([...wizard, ["website", "spam"]]))).toEqual({ status: "sent" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.sendInquiryEmails).not.toHaveBeenCalled();
  });

  it("refuses without its services, without a privacy policy, over a limit or without Turnstile", async () => {
    mocks.configured.email = false;
    expect((await sendInquiry({ status: "idle" }, form(wizard))).status).toBe("unavailable");
    mocks.configured.email = true;
    mocks.privacyVersion = null;
    expect((await sendInquiry({ status: "idle" }, form(wizard))).status).toBe("unavailable");
    mocks.privacyVersion = "v";
    mocks.rateLimit.mockResolvedValueOnce("limited");
    expect((await sendInquiry({ status: "idle" }, form(wizard))).status).toBe("rateLimited");
    mocks.rateLimit.mockResolvedValueOnce("unavailable");
    expect((await sendInquiry({ status: "idle" }, form(wizard))).status).toBe("unavailable");
    mocks.verifyTurnstile.mockResolvedValueOnce(false);
    expect((await sendInquiry({ status: "idle" }, form(wizard))).status).toBe("verification");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.sendInquiryEmails).not.toHaveBeenCalled();
  });

  it("reports a failed write and sends no email", async () => {
    mocks.create.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "tour not found" } });
    expect((await sendInquiry({ status: "idle" }, form(wizard))).status).toBe("failed");
    expect(mocks.sendInquiryEmails).not.toHaveBeenCalled();
  });
});
