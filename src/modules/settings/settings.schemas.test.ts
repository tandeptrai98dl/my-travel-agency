import { describe, expect, it } from "vitest";

import {
  bookingRulesInputSchema,
  companyInputSchema,
  companySettingsSchema,
  contactInputSchema,
  contactSettingsSchema,
  homepageInputSchema,
  homepageSettingsSchema,
  saveSettingsSchema,
  socialInputSchema,
  socialSettingsSchema,
} from "./settings.schemas";

const errors = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]));

describe("settings input schemas", () => {
  it("store values the public readers parse back unchanged", () => {
    const company = companyInputSchema.parse({
      name: " Brand ",
      legal_name: "",
      tax_code: "0101234567-001",
      tour_operator_licence: "01-123/2026/TCDL-GP LHQT",
      ecommerce_notification_url: "http://online.gov.vn/Home/WebDetails/1",
      address: { vi: "Hà Nội", en: "" },
    });
    expect(company).toMatchObject({ name: "Brand", legal_name: null, address: { vi: "Hà Nội" } });
    expect(companySettingsSchema.parse(company)).toEqual(company);

    const contact = contactInputSchema.parse({
      phone: "+84 24 0000 0000",
      email: "hello@example.com",
      zalo: "",
      whatsapp: "",
      office_hours: { vi: "", en: "" },
    });
    expect(contact.office_hours).toBeNull();
    expect(contactSettingsSchema.parse(contact)).toEqual(contact);

    const social = socialInputSchema.parse({ facebook: "https://facebook.com/brand", instagram: "", youtube: null, tiktok: "" });
    expect(socialSettingsSchema.parse(social)).toEqual(social);

    const homepage = homepageInputSchema.parse({
      hero: { eyebrow: { vi: "Hành trình", en: "Journeys" }, title: { vi: "", en: "" }, media_id: null },
      featured_destination_keys: ["vietnam"],
      journal_teaser_count: 3,
    });
    expect(homepageSettingsSchema.parse(homepage)).toEqual(homepage);
  });

  it("refuses what the readers would silently drop, with message keys", () => {
    expect(
      errors(
        companyInputSchema.safeParse({
          name: "",
          tax_code: "12345",
          ecommerce_notification_url: "javascript:alert(1)",
          address: { vi: "", en: "" },
        }),
      ),
    ).toEqual({ name: "required", tax_code: "taxCodeInvalid", ecommerce_notification_url: "urlInvalid" });
    expect(errors(socialInputSchema.safeParse({ facebook: "http://facebook.com/brand" }))).toEqual({ facebook: "httpsOnly" });
    expect(errors(contactInputSchema.safeParse({ email: "nope", phone: "call me", office_hours: { vi: "", en: "" } }))).toEqual({
      email: "emailInvalid",
      phone: "phoneInvalid",
    });
  });

  it("sorts and deduplicates reminder days and bounds the booking cutoff (0–60)", () => {
    const rules = {
      hold_minutes: { vnpay: 30, bank_transfer: 120 },
      balance_reminder_days_before_due: [2, 7, 2],
      booking_lookup_link_minutes: 30,
      booking_cutoff_days: 0,
    };
    expect(bookingRulesInputSchema.parse(rules).balance_reminder_days_before_due).toEqual([7, 2]);
    expect(errors(bookingRulesInputSchema.safeParse({ ...rules, booking_cutoff_days: 61 }))).toEqual({
      booking_cutoff_days: "outOfRange",
    });
    expect(errors(bookingRulesInputSchema.safeParse({ ...rules, booking_cutoff_days: 1.5 }))).toEqual({
      booking_cutoff_days: "wholeNumber",
    });
    expect(errors(bookingRulesInputSchema.safeParse({ ...rules, hold_minutes: { vnpay: 5, bank_transfer: 120 } }))).toEqual({
      "hold_minutes.vnpay": "outOfRange",
    });
  });

  it("dispatches on the section", () => {
    expect(saveSettingsSchema.safeParse({ section: "settings", value: {} }).success).toBe(false);
    const parsed = saveSettingsSchema.parse({
      section: "bank_account",
      value: { bank_name: "VCB", bank_bin: "970436", account_number: "0011001234567", account_holder: "cong ty abc", branch: "" },
    });
    expect(parsed.value).toMatchObject({ account_holder: "CONG TY ABC", branch: null });
  });
});
