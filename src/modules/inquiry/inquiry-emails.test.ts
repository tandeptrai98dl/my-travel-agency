import { describe, expect, it } from "vitest";

import { loadMessages } from "@/i18n/messages";
import { renderEmail } from "@/modules/notification/render";

import { formatTravelMonth } from "../../../emails/inquiry-received";
import { adminInquiryUrl, buildInquiryEmails, type EmailInquiry, inquirySource, pickTranslation } from "./inquiry-emails";

const messages = { vi: await loadMessages("vi"), en: await loadMessages("en") };
const context = {
  brand: { name: "Lumière Voyages", email: "hello@travel.example", phone: "+84 28 0000 0000" },
  siteUrl: new URL("https://travel.example"),
  messages,
};

const inquiry = (overrides: Partial<EmailInquiry> = {}): EmailInquiry => ({
  id: "25000000-0000-4000-8000-000000000001",
  code: "INQ-2611-0042",
  name: "Anna <b>Berg</b>",
  email: "anna@example.com",
  locale: "en",
  source: "tour_inquiry",
  preferred_contact: "whatsapp",
  company_name: null,
  adults: 2,
  children: 1,
  travel_month: "2027-03",
  flexible_dates: true,
  duration_days: 9,
  budget_per_person: "60_100m",
  destinations_other: "Somewhere quiet",
  created_at: "2026-11-07T09:00:00Z",
  tour: { code: "VN-HER-05", tour_translations: [{ locale: "vi", title: "Di sản Hội An và Huế" }, { locale: "en", title: "Hoi An and Hue Heritage" }] },
  style: { key: "culture", travel_style_translations: [{ locale: "vi", name: "Văn hoá" }] },
  destinations: [[{ locale: "vi", name: "Hội An" }, { locale: "en", name: "Hoi An" }]],
  ...overrides,
});

describe("inquiry emails", () => {
  it("plans the customer acknowledgement and the team alert, each keyed on the inquiry", () => {
    const planned = buildInquiryEmails(inquiry(), context);
    expect(planned.map((item) => [item.template, item.key, item.built.to])).toEqual([
      ["inquiry_received", "inquiry_received:25000000-0000-4000-8000-000000000001", "customer"],
      ["inquiry_alert", "inquiry_alert:25000000-0000-4000-8000-000000000001", "staff"],
    ]);
  });

  it("writes to the customer in the inquiry's language with the code, the tour and the party", async () => {
    const [customer] = buildInquiryEmails(inquiry(), context);
    expect(customer!.built.subject).toBe("We have your request · INQ-2611-0042");
    const { html, text } = await renderEmail(customer!.built.element);
    expect(html).toContain('lang="en"');
    expect(text).toContain("Hoi An and Hue Heritage");
    expect(text).toContain("March 2027 (flexible)");
    expect(text).toContain("2 adults, 1 child");
    expect(text).toContain("9 days");
    expect(text).toContain("INQ-2611-0042");
    // React escapes the name; no raw markup reaches the email.
    expect(html).not.toContain("<b>Berg</b>");
    expect(html).toContain("Anna &lt;b&gt;Berg&lt;/b&gt;");
  });

  it("uses Vietnamese for a Vietnamese inquiry and leaves out rows it does not have", async () => {
    const [customer] = buildInquiryEmails(
      inquiry({ locale: "vi", source: "contact", tour: null, travel_month: null, duration_days: null, adults: null, children: 0 }),
      context,
    );
    expect(customer!.built.subject).toBe("Chúng tôi đã nhận yêu cầu của bạn · INQ-2611-0042");
    const { text } = await renderEmail(customer!.built.element);
    expect(text).toContain("Cảm ơn bạn đã gửi lời nhắn.");
    expect(text).not.toContain("Hành trình");
    expect(text).not.toContain("Số khách");
  });

  it("alerts the team in Vietnamese with the request, without the customer's address, phone or message", async () => {
    const [, staff] = buildInquiryEmails(inquiry({ phone: "+46 70 000 00 00", message: "Secret plans" } as Partial<EmailInquiry>), context);
    expect(staff!.built.subject).toBe("Yêu cầu mới INQ-2611-0042 · Chuyến đi riêng");
    const { html, text } = await renderEmail(staff!.built.element);
    expect(html).toContain('lang="vi"');
    expect(text).toContain("Di sản Hội An và Huế");
    expect(text).toContain("Hội An, Somewhere quiet");
    expect(text).toContain("Văn hoá");
    expect(text).toContain("60–100 triệu đồng");
    expect(text).toContain("WhatsApp");
    expect(text).toContain("Tiếng Anh");
    expect(html).toContain(adminInquiryUrl("25000000-0000-4000-8000-000000000001", context.siteUrl));
    for (const secret of ["anna@example.com", "+46 70", "Secret plans"]) expect(html).not.toContain(secret);
  });

  it("shows unknown sources as a message and unknown codes as they are", async () => {
    expect(inquirySource("wizard_v2")).toBe("contact");
    const [, staff] = buildInquiryEmails(inquiry({ source: null, budget_per_person: "custom", preferred_contact: "pigeon" }), context);
    const { text } = await renderEmail(staff!.built.element);
    expect(text).toContain("custom");
    expect(text).toContain("pigeon");
  });

  it("falls back to the other language's title, then the tour code", () => {
    expect(pickTranslation([{ locale: "vi", title: "Hạ Long" }], "en", "title")).toBe("Hạ Long");
    expect(pickTranslation([{ locale: "en", title: " " }], "en", "title")).toBeNull();
    const [customer] = buildInquiryEmails(inquiry({ tour: { code: "VN-X-01", tour_translations: [] } }), context);
    expect(customer!.built.subject).toContain("INQ-2611-0042");
  });

  it("formats the travel month per language", () => {
    expect(formatTravelMonth("2027-03", "vi")).toBe("03/2027");
    expect(formatTravelMonth("2027-03", "en")).toBe("March 2027");
    expect(formatTravelMonth("soon", "en")).toBe("soon");
  });
});
