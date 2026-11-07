import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findBookingForEmail: vi.fn(),
  recentBookingEvents: vi.fn(),
  sendEmail: vi.fn(),
  claimedEmailKeys: vi.fn(),
  getPublicSettings: vi.fn(),
  after: vi.fn(),
  isEmailConfigured: vi.fn(),
  issueAccessToken: vi.fn(),
  findEmailLogForStaff: vi.fn(),
  eventGroup: vi.fn(),
  logEmailResent: vi.fn(),
  requirePermission: vi.fn(),
}));
vi.mock("./booking-emails.repository", () => ({
  findBookingForEmail: mocks.findBookingForEmail,
  recentBookingEvents: mocks.recentBookingEvents,
  issueAccessToken: mocks.issueAccessToken,
  findEmailLogForStaff: mocks.findEmailLogForStaff,
  eventGroup: mocks.eventGroup,
  logEmailResent: mocks.logEmailResent,
}));
vi.mock("@/modules/notification/email.service", () => ({
  sendEmail: mocks.sendEmail,
  claimedEmailKeys: mocks.claimedEmailKeys,
  isEmailConfigured: mocks.isEmailConfigured,
}));
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/modules/settings/settings.service", () => ({ getPublicSettings: mocks.getPublicSettings }));
vi.mock("@/lib/site-url", () => ({ siteUrl: new URL("https://travel.example") }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { notifyBooking, queuePaymentLinkEmail, resendBookingEmail, sendBalanceOverdueAlert, sendBookingEmails, sendPaymentLinkEmail } = await import("./booking-emails.service");
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
  mocks.isEmailConfigured.mockReturnValue(true);
  mocks.issueAccessToken.mockResolvedValue({ data: "2026-11-14T00:00:00Z", error: null });
  mocks.requirePermission.mockResolvedValue({ id: "staff-1", role: "sales" });
  mocks.logEmailResent.mockResolvedValue({ error: null });
  vi.stubEnv("BOOKING_ACCESS_SECRET", "test-access-secret-0123456789abcdef");
  mocks.getPublicSettings.mockResolvedValue({ company: { name: "Lumière" }, contact: { email: "team@travel.example", phone: null }, social: {} });
});

afterEach(() => vi.unstubAllEnvs());

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
    // The confirmation links to the checkout with a fresh single-use token (ADR-038): only its hash is stored.
    const [bookingId, tokenHash, minutes] = mocks.issueAccessToken.mock.calls[0] as [string, string, number];
    expect([bookingId, minutes]).toEqual(["b-1", 7 * 24 * 60]);
    const token = /\?access=([A-Za-z0-9_-]{43})/.exec(sent[0].html)![1];
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(mocks.issueAccessToken).toHaveBeenCalledTimes(1);
  });

  it("issues no token when email cannot be sent, so nothing is stored for a skipped email", async () => {
    mocks.isEmailConfigured.mockReturnValue(false);
    await sendBookingEmails("b-1");
    expect(mocks.issueAccessToken).not.toHaveBeenCalled();
    expect(mocks.sendEmail.mock.calls[0][0].html).not.toContain("?access=");
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

describe("queuePaymentLinkEmail", () => {
  it("sends after the response and tells the form whether email is set up", async () => {
    const input = { bookingId: "b-1", url: "https://travel.example/en/pay/T", amount: 1, kind: "full" as const, expiresAt: "2026-11-09T10:00:00Z" };
    expect(queuePaymentLinkEmail(input)).toBe("queued");
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    mocks.isEmailConfigured.mockReturnValue(false);
    expect(queuePaymentLinkEmail(input)).toBe("skipped");
  });
});

describe("resendBookingEmail", () => {
  it("rebuilds a customer email from its event and sends it with a fresh key", async () => {
    mocks.findEmailLogForStaff.mockResolvedValue({ data: { id: "l-1", booking_id: "b-1", template: "booking_confirmed", dedupe_key: "booking_confirmed:e2" }, error: null });
    mocks.eventGroup.mockResolvedValue({ data: events, error: null });
    expect(await resendBookingEmail("l-1")).toEqual({ ok: true, status: "sent" });
    expect(mocks.requirePermission).toHaveBeenCalledWith("bookings.edit");
    const message = mocks.sendEmail.mock.calls[0][0];
    expect(message.template).toBe("booking_confirmed");
    expect(message.to).toBe("anna@example.com");
    expect(message.dedupeKey).toMatch(/^booking_confirmed:e2:resend:[0-9a-f-]{36}$/);
    expect(mocks.logEmailResent).toHaveBeenCalledWith("b-1", "staff-1", "booking_confirmed");
  });

  it("never resends payment links or team alerts, and refuses rows it cannot see", async () => {
    mocks.findEmailLogForStaff.mockResolvedValue({ data: { id: "l-2", booking_id: "b-1", template: "payment_link", dedupe_key: "payment_link:abc" }, error: null });
    expect(await resendBookingEmail("l-2")).toEqual({ ok: false, error: "not_resendable" });
    mocks.findEmailLogForStaff.mockResolvedValue({ data: { id: "l-3", booking_id: "b-1", template: "staff_attention", dedupe_key: "staff_attention:e9" }, error: null });
    expect(await resendBookingEmail("l-3")).toEqual({ ok: false, error: "not_resendable" });
    mocks.findEmailLogForStaff.mockResolvedValue({ data: null, error: null });
    expect(await resendBookingEmail("l-4")).toEqual({ ok: false, error: "not_found" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

describe("sendBalanceOverdueAlert", () => {
  it("without a team address claims nothing and counts as no_address, like the minimum-traveller alert", async () => {
    mocks.findBookingForEmail.mockResolvedValue({ data: booking, error: null });
    mocks.getPublicSettings.mockResolvedValue({ company: null, contact: null, social: {} });
    expect(await sendBalanceOverdueAlert("b-1", "balance_overdue:b-1")).toBe("no_address");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("with the address sends once under its key", async () => {
    mocks.findBookingForEmail.mockResolvedValue({ data: booking, error: null });
    mocks.sendEmail.mockResolvedValue("sent");
    expect(await sendBalanceOverdueAlert("b-1", "balance_overdue:b-1")).toBe("sent");
    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({ to: "team@travel.example", dedupeKey: "balance_overdue:b-1" });
  });
});
