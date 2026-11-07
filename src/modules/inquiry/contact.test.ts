import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContactInquiry: vi.fn(),
  sendInquiryEmails: vi.fn(),
  privacyVersion: "privacy-vi-0123456789abcdef" as string | null,
  rateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  configured: { turnstile: true, redis: true, email: true },
  headers: new Map<string, string>(),
}));

vi.mock("./contact.repository", () => ({ createContactInquiry: mocks.createContactInquiry }));
vi.mock("./inquiry-emails.service", () => ({ sendInquiryEmails: mocks.sendInquiryEmails }));
vi.mock("@/modules/content/public/content-public.service", () => ({
  getPrivacyConsent: async (locale: string) =>
    mocks.privacyVersion ? { href: `/${locale}/chinh-sach/bao-mat`, version: mocks.privacyVersion } : null,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, rateLimitKey: (scope: string, id: string) => `rl:${scope}:${id}` }));
vi.mock("@/lib/redis", () => ({ isRedisConfigured: () => mocks.configured.redis }));
vi.mock("@/lib/turnstile", () => ({
  isTurnstileConfigured: () => mocks.configured.turnstile,
  turnstileSiteKey: () => (mocks.configured.turnstile ? "site-key" : null),
  verifyTurnstile: mocks.verifyTurnstile,
}));
vi.mock("@/modules/notification/email.service", () => ({ isEmailConfigured: () => mocks.configured.email }));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));

import { sendContactMessage } from "./contact.actions";
import { contactSchema } from "./contact.schemas";
import { contactAvailability, submitContact } from "./contact.service";

const valid = {
  name: "Lan",
  email: "lan@example.com",
  phone: "",
  preferredContact: "zalo",
  message: "Tôi muốn hỏi về tour Hạ Long tháng sau.",
  tourCode: "VN-HLB-03",
  consent: "on",
  locale: "vi",
};
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(mocks.configured, { turnstile: true, redis: true, email: true });
  mocks.rateLimit.mockResolvedValue("ok");
  mocks.verifyTurnstile.mockResolvedValue(true);
  mocks.createContactInquiry.mockResolvedValue({ data: "INQ-2611-0001", error: null });
  mocks.privacyVersion = "privacy-vi-0123456789abcdef";
  mocks.headers.clear();
});

describe("contact schema", () => {
  it("normalises the input and requires consent", () => {
    const parsed = contactSchema.parse({ ...valid, email: " Lan@Example.com ", phone: " " });
    expect(parsed).toMatchObject({ email: "lan@example.com", phone: null, tourCode: "VN-HLB-03" });
    expect(contactSchema.safeParse({ ...valid, consent: undefined }).success).toBe(false);
    expect(contactSchema.parse({ ...valid, tourCode: "<script>" }).tourCode).toBeNull();
  });
});

describe("submitContact", () => {
  const input = contactSchema.parse(valid);
  const meta = { turnstileToken: "cf", ip: "203.0.113.7", userAgent: "UA" };

  it("is refused, with nothing written, while a service is missing", async () => {
    for (const missing of ["turnstile", "redis", "email"] as const) {
      Object.assign(mocks.configured, { turnstile: true, redis: true, email: true, [missing]: false });
      expect(contactAvailability()).toEqual({ enabled: false, siteKey: null });
      expect(await submitContact(input, meta)).toEqual({ status: "unavailable" });
    }
    expect(mocks.createContactInquiry).not.toHaveBeenCalled();
  });

  it("is refused, with nothing written, while the privacy policy is not published", async () => {
    mocks.privacyVersion = null;
    expect(await submitContact(input, meta)).toEqual({ status: "unavailable" });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.createContactInquiry).not.toHaveBeenCalled();
  });

  it("limits by IP before verifying and by address only after Turnstile", async () => {
    mocks.rateLimit.mockResolvedValueOnce("limited");
    expect(await submitContact(input, meta)).toEqual({ status: "rateLimited" });
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    expect(mocks.rateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.rateLimit).toHaveBeenCalledWith(["rl:contact-ip:203.0.113.7"], 5, 600);

    mocks.rateLimit.mockClear();
    mocks.verifyTurnstile.mockResolvedValueOnce(false);
    expect(await submitContact(input, meta)).toEqual({ status: "verification" });
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith("cf", { action: "contact", ip: "203.0.113.7" });
    // An unverified request never touches the address's allowance.
    expect(mocks.rateLimit).toHaveBeenCalledTimes(1);

    mocks.rateLimit.mockClear();
    mocks.rateLimit.mockResolvedValueOnce("ok").mockResolvedValueOnce("limited");
    expect(await submitContact(input, meta)).toEqual({ status: "rateLimited" });
    expect(mocks.rateLimit).toHaveBeenLastCalledWith(["rl:contact-email:lan@example.com"], 3, 3600);

    mocks.rateLimit.mockResolvedValue("unavailable");
    expect(await submitContact(input, meta)).toEqual({ status: "unavailable" });
    expect(mocks.createContactInquiry).not.toHaveBeenCalled();
  });

  it("saves the inquiry with the published privacy policy's version, then sends the inquiry emails by code", async () => {
    expect(await submitContact(input, meta)).toEqual({ status: "sent", code: "INQ-2611-0001" });
    expect(mocks.createContactInquiry).toHaveBeenCalledWith(input, "privacy-vi-0123456789abcdef", "203.0.113.7", "UA");
    // One call covers the customer's acknowledgement and the team alert (no separate staff email).
    expect(mocks.sendInquiryEmails).toHaveBeenCalledTimes(1);
    expect(mocks.sendInquiryEmails).toHaveBeenCalledWith("INQ-2611-0001");
    expect(mocks.createContactInquiry.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendInquiryEmails.mock.invocationCallOrder[0]);
  });

  it("sends no email when the write fails", async () => {
    mocks.createContactInquiry.mockResolvedValue({ data: null, error: { code: "22023", message: "invalid message" } });
    expect(await submitContact(input, meta)).toEqual({ status: "failed" });
    expect(mocks.sendInquiryEmails).not.toHaveBeenCalled();
  });
});

describe("sendContactMessage", () => {
  it("returns field errors without calling the service", async () => {
    const result = await sendContactMessage({ status: "idle" }, form({ ...valid, email: "nope", message: "ngắn", consent: "" }));
    expect(result.status).toBe("invalid");
    expect(result.errors).toMatchObject({ email: "invalidEmail", message: "tooShort", consent: "consentRequired" });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it("answers a filled honeypot as a success and saves nothing", async () => {
    expect(await sendContactMessage({ status: "idle" }, form({ ...valid, website: "spam" }))).toEqual({ status: "sent" });
    expect(mocks.createContactInquiry).not.toHaveBeenCalled();
  });

  it("passes the Turnstile token and the forwarded IP", async () => {
    mocks.headers.set("x-forwarded-for", "203.0.113.9, 10.0.0.1");
    const result = await sendContactMessage({ status: "idle" }, form({ ...valid, "cf-turnstile-response": "cf-token" }));
    expect(result).toEqual({ status: "sent", code: "INQ-2611-0001" });
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith("cf-token", { action: "contact", ip: "203.0.113.9" });
  });
});
