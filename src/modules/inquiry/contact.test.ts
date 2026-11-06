import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContactInquiry: vi.fn(),
  rateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  sendEmail: vi.fn(),
  configured: { turnstile: true, redis: true, email: true },
  headers: new Map<string, string>(),
  staffEmail: "team@example.com" as string | null,
}));

vi.mock("./contact.repository", () => ({ createContactInquiry: mocks.createContactInquiry }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, rateLimitKey: (scope: string, id: string) => `rl:${scope}:${id}` }));
vi.mock("@/lib/redis", () => ({ isRedisConfigured: () => mocks.configured.redis }));
vi.mock("@/lib/turnstile", () => ({
  isTurnstileConfigured: () => mocks.configured.turnstile,
  turnstileSiteKey: () => (mocks.configured.turnstile ? "site-key" : null),
  verifyTurnstile: mocks.verifyTurnstile,
}));
vi.mock("@/modules/notification/email.repository", () => ({ insertEmailLog: vi.fn() }));
vi.mock("@/modules/notification/email.service", async (original) => ({
  ...(await original<typeof import("@/modules/notification/email.service")>()),
  isEmailConfigured: () => mocks.configured.email,
  sendEmail: mocks.sendEmail,
}));
vi.mock("@/modules/settings/settings.service", () => ({
  getPublicSettings: async () => ({ company: null, contact: mocks.staffEmail ? { email: mocks.staffEmail } : null, social: {} }),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));

import { sendContactMessage } from "./contact.actions";
import { contactSchema } from "./contact.schemas";
import { contactAvailability, staffNotification, submitContact } from "./contact.service";

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
  mocks.staffEmail = "team@example.com";
  mocks.rateLimit.mockResolvedValue("ok");
  mocks.verifyTurnstile.mockResolvedValue(true);
  mocks.createContactInquiry.mockResolvedValue({ data: "INQ-2611-0001", error: null });
  mocks.sendEmail.mockResolvedValue("sent");
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

  it("rate-limits (fail closed) before verifying, then verifies before writing", async () => {
    mocks.rateLimit.mockResolvedValueOnce("limited").mockResolvedValueOnce("ok");
    expect(await submitContact(input, meta)).toEqual({ status: "rateLimited" });
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    mocks.rateLimit.mockResolvedValue("unavailable");
    expect(await submitContact(input, meta)).toEqual({ status: "unavailable" });
    mocks.rateLimit.mockResolvedValue("ok");
    mocks.verifyTurnstile.mockResolvedValue(false);
    expect(await submitContact(input, meta)).toEqual({ status: "verification" });
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith("cf", { action: "contact", ip: "203.0.113.7" });
    expect(mocks.createContactInquiry).not.toHaveBeenCalled();
  });

  it("saves the inquiry with the consent version and notifies the team", async () => {
    expect(await submitContact(input, meta)).toEqual({ status: "sent", code: "INQ-2611-0001" });
    expect(mocks.createContactInquiry).toHaveBeenCalledWith(input, "privacy-2026-11", "203.0.113.7", "UA");
    const message = mocks.sendEmail.mock.calls[0][0] as { to: string; template: string; subject: string };
    expect(message).toMatchObject({ to: "team@example.com", template: "contact_staff", subject: "Liên hệ mới INQ-2611-0001 từ Lan" });
  });

  it("keeps a saved message when the notification cannot be sent, and reports write failures", async () => {
    mocks.staffEmail = null;
    expect(await submitContact(input, meta)).toEqual({ status: "sent", code: "INQ-2611-0001" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    mocks.createContactInquiry.mockResolvedValue({ data: null, error: { code: "22023", message: "invalid message" } });
    expect(await submitContact(input, meta)).toEqual({ status: "failed" });
  });

  it("escapes the visitor's text in the staff email", () => {
    const email = staffNotification("INQ-1", contactSchema.parse({ ...valid, name: "<b>Lan</b>", message: "<script>x</script> hello there" }));
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;b&gt;Lan&lt;/b&gt;");
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
