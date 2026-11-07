import { describe, expect, it } from "vitest";

import { loadMessages } from "@/i18n/messages";
import { renderEmail } from "@/modules/notification/render";

import {
  amountFromEvent,
  type BookingEventRow,
  buildBalanceReminderEmail,
  buildBookingLookupEmail,
  buildBookingEmail,
  buildPaymentLinkEmail,
  checkoutUrl,
  dueNow,
  type EmailBooking,
  type PlannedEmail,
  planBookingEmails,
} from "./booking-emails";

const messages = { vi: await loadMessages("vi"), en: await loadMessages("en") };
const site = new URL("https://travel.example");
const context = {
  brand: { name: "Lumière Voyages", email: "hello@travel.example", phone: "+84 28 0000 0000" },
  siteUrl: site,
  messages,
};

const booking = (overrides: Partial<EmailBooking> = {}): EmailBooking => ({
  id: "00000000-0000-4000-8000-000000000001",
  code: "PTA-2611-0042",
  type: "instant",
  locale: "vi",
  contact_name: "Nguyễn Thị Lan",
  contact_email: "lan@example.com",
  start_date: "2026-12-20",
  adults: 2,
  children: 1,
  infants: 0,
  total: 30_000_000,
  deposit_amount: 9_000_000,
  amount_paid: 9_000_000,
  payment_plan: "deposit",
  balance_due_date: "2026-11-20",
  hold_expires_at: "2026-11-07T08:30:00Z",
  tour_snapshot: { code: "HL-01", title: "Vịnh Hạ Long trên du thuyền", end_date: "2026-12-22" },
  cancellation_policy_snapshot: { summary: { vi: "Hoàn 80% khi hủy trước 30 ngày.", en: "80% back up to 30 days before." } },
  ...overrides,
});

let n = 0;
const event = (type: string, extra: Partial<BookingEventRow> = {}): BookingEventRow => ({
  id: `e-${++n}`,
  type,
  from_status: null,
  to_status: null,
  message: null,
  actor_id: null,
  created_at: "2026-11-07T08:00:00.000+00:00",
  ...extra,
});

describe("planBookingEmails", () => {
  it("sends booking received on the first hold of an instant booking only", () => {
    const hold = event("status_changed", { from_status: "draft", to_status: "pending_payment" });
    const quote = event("status_changed", { from_status: "quoted", to_status: "pending_payment" });
    const switched = event("payment_method_changed", { from_status: "pending_payment", to_status: "pending_payment" });
    expect(planBookingEmails([hold, quote, switched])).toEqual([{ template: "booking_received", key: `booking_received:${hold.id}` }]);
  });

  it("a payment that confirms sends booking confirmed (customer and staff), not payment received", () => {
    const at = "2026-11-07T09:00:00.123+00:00";
    const paid = event("payment_received", { message: "PTA2611004201 9000000", created_at: at, from_status: "pending_payment", to_status: "pending_payment" });
    const confirmed = event("status_changed", { from_status: "pending_payment", to_status: "confirmed", created_at: at });
    expect(planBookingEmails([confirmed, paid]).map((p) => p.key)).toEqual([`booking_confirmed:${confirmed.id}`, `staff_booking_confirmed:${confirmed.id}`]);
  });

  it("a later payment sends payment received with its amount, flagged when the same transaction flagged it", () => {
    const balance = event("payment_received", { message: "PTA2611004202 21000000", created_at: "2026-11-08T01:00:00+00:00" });
    const over = event("payment_received", { message: "PTA2611004202-1 5000000", created_at: "2026-11-08T02:00:00+00:00" });
    const flag = event("needs_attention", { message: "overpaid", created_at: "2026-11-08T02:00:00+00:00" });
    expect(planBookingEmails([balance, over, flag])).toEqual<PlannedEmail[]>([
      { template: "payment_received", key: `payment_received:${balance.id}`, amount: 21_000_000, flagged: false },
      { template: "payment_received", key: `payment_received:${over.id}`, amount: 5_000_000, flagged: true },
      { template: "staff_attention", key: `staff_attention:${flag.id}`, reason: "overpaid" },
    ]);
  });

  it("alerts staff only for flags the system raised", () => {
    expect(planBookingEmails([event("needs_attention", { message: "paid_after_cancel", actor_id: "staff-1" })])).toEqual([]);
  });

  it("sends cancelled only to customers who had heard about the booking", () => {
    const fromHold = event("status_changed", { from_status: "pending_payment", to_status: "cancelled" });
    const fromDraft = event("status_changed", { from_status: "draft", to_status: "cancelled" });
    const fromExpired = event("status_changed", { from_status: "expired", to_status: "cancelled" });
    expect(planBookingEmails([fromHold, fromDraft, fromExpired]).map((p) => p.key)).toEqual([`booking_cancelled:${fromHold.id}`]);
  });

  it("keys every email on its event, so the same events plan the same keys (replays send nothing new)", () => {
    const events = [event("status_changed", { from_status: "draft", to_status: "pending_payment" }), event("payment_received", { message: "X 1" })];
    expect(planBookingEmails(events)).toEqual(planBookingEmails([...events].reverse()));
  });

  it("reads the amount from the event message", () => {
    expect(amountFromEvent("PTA2611004201 9000000")).toBe(9_000_000);
    expect(amountFromEvent("PTA2611004201-2 150000")).toBe(150_000);
    expect(amountFromEvent("odd")).toBeNull();
    expect(amountFromEvent(null)).toBeNull();
  });
});

describe("checkoutUrl", () => {
  it("is the localized checkout, with the single-use token when one was issued", () => {
    const token = "t".repeat(43);
    const vi = new URL(checkoutUrl(booking(), site, token));
    expect(vi.pathname).toBe("/thanh-toan/PTA-2611-0042");
    expect(vi.searchParams.get("access")).toBe(token);
    expect(new URL(checkoutUrl(booking({ locale: "en" }), site, null)).toString()).toBe("https://travel.example/en/checkout/PTA-2611-0042");
  });
});

describe("dueNow", () => {
  it("is the plan's amount less what was paid", () => {
    expect(dueNow({ payment_plan: "deposit", deposit_amount: 9, total: 30, amount_paid: 0 })).toBe(9);
    expect(dueNow({ payment_plan: "full", deposit_amount: 9, total: 30, amount_paid: 10 })).toBe(20);
    expect(dueNow({ payment_plan: "full", deposit_amount: 9, total: 30, amount_paid: 40 })).toBe(0);
  });
});

const customerPlans: PlannedEmail[] = [
  { template: "booking_received", key: "k1" },
  { template: "payment_received", key: "k2", amount: 21_000_000, flagged: true },
  { template: "booking_confirmed", key: "k3" },
  { template: "booking_cancelled", key: "k4" },
];

describe("templates", () => {
  it.each(["vi", "en"] as const)("render every customer email in %s, with text and an escaped body", async (locale) => {
    const hostile = booking({ locale, contact_name: `<script>alert("x")</script> & Co`, tour_snapshot: { title: `<img src=x onerror=alert(1)>`, end_date: "2026-12-22" } });
    for (const planned of customerPlans) {
      const built = buildBookingEmail(planned, hostile, context);
      expect(built.to).toBe("customer");
      expect(built.subject).toContain("PTA-2611-0042");
      const { html, text } = await renderEmail(built.element);
      expect(html).toContain(`<html lang="${locale}"`);
      expect(html).toContain("Lumière Voyages");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&lt;script&gt;");
      expect(text).toContain("PTA-2611-0042");
      expect(text.length).toBeGreaterThan(100);
    }
  });

  it("writes Vietnamese and English copy with formatted amounts and dates", async () => {
    const vi = await renderEmail(buildBookingEmail({ template: "booking_confirmed", key: "k" }, booking(), context, "tok_vi").element);
    expect(vi.text).toContain("Chuyến đi của bạn đã được xác nhận");
    expect(vi.text).toContain("Kính gửi Nguyễn Thị Lan");
    expect(vi.text).toContain("2 người lớn, 1 trẻ em");
    expect(vi.text).toMatch(/21\.000\.000\s?₫/);
    expect(vi.text).toContain("Hoàn 80% khi hủy trước 30 ngày.");
    expect(vi.html).toContain("/thanh-toan/PTA-2611-0042?access=tok_vi");

    const en = await renderEmail(buildBookingEmail({ template: "booking_confirmed", key: "k" }, booking({ locale: "en", adults: 1, children: 0 }), context, null).element);
    expect(en.text).toContain("Your journey is confirmed");
    expect(en.text).toContain("1 adult");
    expect(en.text).toContain("80% back up to 30 days before.");
    expect(en.html).toContain('href="https://travel.example/en/checkout/PTA-2611-0042"');
  });

  it("states the hold in Vietnam time and the amount due now", async () => {
    const { text } = await renderEmail(
      buildBookingEmail({ template: "booking_received", key: "k" }, booking({ amount_paid: 0, hold_expires_at: "2026-11-07T08:30:00Z" }), context).element,
    );
    expect(text).toContain("15:30");
    expect(text).toMatch(/9\.000\.000\s?₫/);
  });

  it("mentions the refund on a cancellation only when money was paid", async () => {
    const paid = await renderEmail(buildBookingEmail({ template: "booking_cancelled", key: "k" }, booking(), context).element);
    const unpaid = await renderEmail(buildBookingEmail({ template: "booking_cancelled", key: "k" }, booking({ amount_paid: 0 }), context).element);
    expect(paid.text).toContain("hoàn tiền");
    expect(unpaid.text).not.toContain("hoàn tiền");
  });

  it("renders staff alerts in Vietnamese with the reason label and an admin link, without customer contact details", async () => {
    for (const locale of ["vi", "en"] as const) {
      const attention = buildBookingEmail({ template: "staff_attention", key: "k", reason: "late_payment_no_seats" }, booking({ locale }), context);
      expect(attention.to).toBe("staff");
      expect(attention.subject).toBe("Cần xử lý · PTA-2611-0042");
      const { html, text } = await renderEmail(attention.element);
      expect(html).toContain('<html lang="vi"');
      expect(text).toContain("Trả trễ, đã hết chỗ");
      expect(html).toContain("https://travel.example/admin/bookings/00000000-0000-4000-8000-000000000001");
      expect(text).not.toContain("lan@example.com");
      expect(text).not.toContain("Nguyễn Thị Lan");
    }
    const confirmed = await renderEmail(buildBookingEmail({ template: "staff_booking_confirmed", key: "k" }, booking(), context).element);
    expect(confirmed.text).toContain("PTA-2611-0042 đã được xác nhận");
  });

  it.each(["vi", "en"] as const)("renders the payment link and the balance reminder in %s", async (locale) => {
    const url = "https://travel.example/thanh-toan/link/tok_abcdefghijklmnop";
    const link = buildPaymentLinkEmail(booking({ locale, type: "quoted" }), { url, amount: 12_000_000, kind: "deposit", expiresAt: "2026-11-10T10:00:00Z" }, context);
    expect(link.subject).toContain("PTA-2611-0042");
    expect(link.subject).not.toContain("tok_");
    const rendered = await renderEmail(link.element);
    expect(rendered.html).toContain(`href="${url}"`);
    expect(rendered.text).toContain("17:00");

    const reminder = await renderEmail(buildBalanceReminderEmail(booking({ locale }), context).element);
    expect(reminder.text).toMatch(/21[.,]000[.,]000/);
  });
});

describe("booking lookup email", () => {
  it("links the checkout with the single-use token and says when it stops working", async () => {
    const built = buildBookingLookupEmail(booking({ locale: "en" }), { token: "tok_abc", expiresAt: "2026-11-07T10:30:00Z" }, context);
    expect(built.template).toBe("booking_lookup");
    expect(built.subject).toBe("A link to your booking · PTA-2611-0042");
    const { html, text } = await renderEmail(built.element);
    expect(html).toContain("https://travel.example/en/checkout/PTA-2611-0042?access=tok_abc");
    expect(text).toContain("17:30");
    expect(built.subject).not.toContain("tok_abc");
  });
});
