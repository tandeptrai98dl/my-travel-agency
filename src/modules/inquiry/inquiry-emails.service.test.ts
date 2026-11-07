import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findInquiryForEmail: vi.fn(),
  destinationNames: vi.fn(),
  sendEmail: vi.fn(),
  getPublicSettings: vi.fn(),
  after: vi.fn(),
}));
vi.mock("./inquiry-emails.repository", () => ({ findInquiryForEmail: mocks.findInquiryForEmail, destinationNames: mocks.destinationNames }));
vi.mock("@/modules/notification/email.service", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/modules/settings/settings.service", () => ({ getPublicSettings: mocks.getPublicSettings }));
vi.mock("@/lib/site-url", () => ({ siteUrl: new URL("https://travel.example") }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { deliverInquiryEmails, sendInquiryEmails } = await import("./inquiry-emails.service");
const { logger } = await import("@/lib/logger");

const id = "25000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-11-07T10:00:00Z");
const row = {
  id,
  code: "INQ-2611-0042",
  name: "Lan",
  email: "lan@example.com",
  locale: "vi",
  source: "tailor_made",
  preferred_contact: "zalo",
  company_name: null,
  adults: 2,
  children: 0,
  travel_month: "2027-03",
  flexible_dates: true,
  duration_days: null,
  budget_per_person: null,
  destination_ids: ["d1", "d2"],
  destinations_other: null,
  created_at: "2026-11-07T09:59:00Z",
  tour: null,
  style: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findInquiryForEmail.mockResolvedValue({ data: row, error: null });
  mocks.destinationNames.mockResolvedValue({ data: [{ destination_id: "d2", locale: "vi", name: "Sa Pa" }], error: null });
  mocks.sendEmail.mockResolvedValue("sent");
  mocks.getPublicSettings.mockResolvedValue({ company: { name: "Lumière" }, contact: { email: "team@travel.example", phone: null }, social: {} });
});

describe("sendInquiryEmails", () => {
  it("sends the acknowledgement to the customer and the alert to the team, keyed once per inquiry", async () => {
    const outcome = await deliverInquiryEmails(id, now);
    expect(outcome).toEqual({ inquiry_received: "sent", inquiry_alert: "sent" });
    expect(mocks.findInquiryForEmail).toHaveBeenCalledWith({ id });
    expect(mocks.destinationNames).toHaveBeenCalledWith(["d1", "d2"]);
    const calls = mocks.sendEmail.mock.calls.map(([message]) => message);
    expect(calls.map((message) => [message.to, message.template, message.dedupeKey, message.inquiryId])).toEqual([
      ["lan@example.com", "inquiry_received", `inquiry_received:${id}`, id],
      ["team@travel.example", "inquiry_alert", `inquiry_alert:${id}`, id],
    ]);
    expect(calls[1]!.text).toContain("Sa Pa");
    expect(calls[0]!.subject).toContain("INQ-2611-0042");
  });

  it("finds an inquiry by its code too (the contact form returns only the code)", async () => {
    await deliverInquiryEmails(" inq-2611-0042 ", now);
    expect(mocks.findInquiryForEmail).toHaveBeenCalledWith({ code: "INQ-2611-0042" });
  });

  it("refuses anything that is neither an id nor a code, without a query", async () => {
    expect(await deliverInquiryEmails("1; drop table", now)).toBeNull();
    expect(mocks.findInquiryForEmail).not.toHaveBeenCalled();
  });

  it("reports skipped and duplicate sends as the email service returns them", async () => {
    mocks.sendEmail.mockResolvedValueOnce("unavailable").mockResolvedValueOnce("duplicate");
    expect(await deliverInquiryEmails(id, now)).toEqual({ inquiry_received: "unavailable", inquiry_alert: "duplicate" });
  });

  it("still acknowledges the customer when the team has no address", async () => {
    mocks.getPublicSettings.mockResolvedValue({ company: { name: "Lumière" }, contact: null, social: {} });
    expect(await deliverInquiryEmails(id, now)).toEqual({ inquiry_received: "sent", inquiry_alert: "no_address" });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("never mails an inquiry older than two days", async () => {
    mocks.findInquiryForEmail.mockResolvedValue({ data: { ...row, created_at: "2026-11-01T00:00:00Z" }, error: null });
    expect(await deliverInquiryEmails(id, now)).toBeNull();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("logs a failed read and a failed send without throwing", async () => {
    mocks.findInquiryForEmail.mockResolvedValueOnce({ data: null, error: { code: "PGRST000" } });
    expect(await deliverInquiryEmails(id, now)).toBeNull();
    expect(logger.error).toHaveBeenCalledWith("inquiry.email_load_failed", { code: "PGRST000" });
    mocks.sendEmail.mockRejectedValueOnce(new TypeError("boom"));
    expect(await deliverInquiryEmails(id, now)).toEqual({ inquiry_received: "failed", inquiry_alert: "sent" });
  });

  it("sends after the response", async () => {
    mocks.findInquiryForEmail.mockResolvedValue({ data: { ...row, created_at: new Date().toISOString() }, error: null });
    sendInquiryEmails(id);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0]![0]();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("runs in the background outside a request", async () => {
    mocks.findInquiryForEmail.mockResolvedValue({ data: { ...row, created_at: new Date().toISOString() }, error: null });
    mocks.after.mockImplementation(() => {
      throw new Error("outside a request scope");
    });
    sendInquiryEmails(id);
    await vi.waitFor(() => expect(mocks.sendEmail).toHaveBeenCalledTimes(2));
  });
});
