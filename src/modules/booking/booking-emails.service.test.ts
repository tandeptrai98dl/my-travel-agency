import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findBookingForEmail: vi.fn(),
  recentBookingEvents: vi.fn(),
  sendEmail: vi.fn(),
  claimedEmailKeys: vi.fn(),
  getPublicSettings: vi.fn(),
  after: vi.fn(),
}));
vi.mock("./booking-emails.repository", () => ({ findBookingForEmail: mocks.findBookingForEmail, recentBookingEvents: mocks.recentBookingEvents }));
vi.mock("@/modules/notification/email.service", () => ({ sendEmail: mocks.sendEmail, claimedEmailKeys: mocks.claimedEmailKeys }));
vi.mock("@/modules/settings/settings.service", () => ({ getPublicSettings: mocks.getPublicSettings }));
vi.mock("@/lib/site-url", () => ({ siteUrl: new URL("https://travel.example") }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { notifyBooking, sendBookingEmails, sendPaymentLinkEmail } = await import("./booking-emails.service");
const { logger } = await import("@/lib/logger");

const booking = {
  id: "b-1",
  code: "PTA-2611-0042",
  type: "instant",
  locale: "en",
  contact_name: "Anna",
  contact_email: "anna@example.com",
  start_date: "2026-12-20",
  adults: 2,
  children: 0,
  infants: 0,
  total: 20_000_000,
  deposit_amount: 6_000_000,
  amount_paid: 6_000_000,
  payment_plan: "deposit",
  balance_due_date: "2026-11-20",
  hold_expires_at: null,
  tour_snapshot: { title: "Ha Long Bay", end_date: "2026-12-22" },
  cancellation_policy_snapshot: null,
};
const at = "2026-11-07T09:00:00+00:00";
const events = [
  { id: "e1", type: "payment_received", from_status: "pending_payment", to_status: "pending_payment", message: "PTA2611004201 6000000", actor_id: null, created_at: at },
  { id: "e2", type: "status_changed", from_status: "pending_payment", to_status: "confirmed", message: "PTA2611004201", actor_id: null, created_at: at },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findBookingForEmail.mockResolvedValue({ data: booking, error: null });
  mocks.recentBookingEvents.mockResolvedValue({ data: events, error: null });
  mocks.claimedEmailKeys.mockResolvedValue({ keys: new Set() });
  mocks.sendEmail.mockResolvedValue("sent");
  mocks.getPublicSettings.mockResolvedValue({ company: { name: "Lumière" }, contact: { email: "team@travel.example", phone: null }, social: {} });
});

describe("sendBookingEmails", () => {
  it("sends the confirmation to the customer and the alert to the team, keyed on the event", async () => {
    await sendBookingEmails("b-1", Date.parse("2026-11-07T10:00:00Z"));
    expect(mocks.recentBookingEvents).toHaveBeenCalledWith("b-1", "2026-11-05T10:00:00.000Z");
    const sent = mocks.sendEmail.mock.calls.map((call) => call[0]);
    expect(sent.map((m) => [m.template, m.to, m.dedupeKey, m.bookingId])).toEqual([
      ["booking_confirmed", "anna@example.com", "booking_confirmed:e2", "b-1"],
      ["staff_booking_confirmed", "team@travel.example", "staff_booking_confirmed:e2", "b-1"],
    ]);
    expect(sent[0].subject).toBe("Your journey is confirmed · PTA-2611-0042");
    expect(sent[0].html).toContain("Lumière");
  });

  it("skips emails already claimed, so a second call (or a replayed IPN) sends nothing new", async () => {
    mocks.claimedEmailKeys.mockResolvedValue({ keys: new Set(["booking_confirmed:e2", "staff_booking_confirmed:e2"]) });
    await sendBookingEmails("b-1");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.getPublicSettings).not.toHaveBeenCalled();
  });

  it("skips the team alert without a contact address and never throws", async () => {
    mocks.getPublicSettings.mockResolvedValue({ company: null, contact: null, social: {} });
    await sendBookingEmails("b-1");
    expect(mocks.sendEmail.mock.calls.map((call) => call[0].template)).toEqual(["booking_confirmed"]);
    mocks.sendEmail.mockRejectedValue(new Error("boom anna@example.com"));
    await expect(sendBookingEmails("b-1")).resolves.toBeUndefined();
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain("anna@");
  });

  it("logs and stops when the booking cannot be read", async () => {
    mocks.findBookingForEmail.mockResolvedValue({ data: null, error: { code: "08006" } });
    await sendBookingEmails("b-1");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("booking.email_load_failed", { code: "08006" });
  });
});

describe("notifyBooking", () => {
  it("runs after the response, and in the background outside a request", async () => {
    notifyBooking("b-1");
    expect(mocks.after).toHaveBeenCalledTimes(1);
    mocks.after.mockImplementationOnce(() => {
      throw new Error("outside a request scope");
    });
    notifyBooking("b-1");
    await vi.waitFor(() => expect(mocks.sendEmail).toHaveBeenCalledTimes(2));
    notifyBooking(null);
    expect(mocks.after).toHaveBeenCalledTimes(2);
  });
});

describe("sendPaymentLinkEmail", () => {
  it("puts the token only in the body and keys the email on a hash of the link", async () => {
    const url = "https://travel.example/en/pay/SECRET_TOKEN_abcdefghijklmnopqrstuvwxyz0123";
    expect(await sendPaymentLinkEmail({ bookingId: "b-1", url, amount: 6_000_000, kind: "deposit", expiresAt: "2026-11-09T10:00:00Z" })).toBe("sent");
    const message = mocks.sendEmail.mock.calls[0][0];
    expect(message.template).toBe("payment_link");
    expect(message.html).toContain(url);
    expect(message.dedupeKey).toMatch(/^payment_link:[0-9a-f]{40}$/);
    expect(message.subject).not.toContain("SECRET_TOKEN");
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain("SECRET_TOKEN");
  });
});
