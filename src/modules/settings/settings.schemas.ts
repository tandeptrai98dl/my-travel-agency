import { z } from "zod";

const localized = z.object({ vi: z.string().optional(), en: z.string().optional() }).partial();
const optionalText = z.string().trim().min(1).nullish().transform((value) => value ?? null);
// Only web links from settings are rendered (never javascript: or data: hrefs). An invalid URL
// drops just that field, so one bad link cannot hide the rest of the company or social details.
const webUrl = (protocol: RegExp) =>
  z
    .url({ protocol })
    .nullish()
    .transform((value) => value ?? null)
    .catch(null);
const optionalUrl = webUrl(/^https$/);
// The Ministry of Industry and Trade notification badge links are often still http://.
const notificationUrl = webUrl(/^https?$/);

/** `settings.company` (public): legal details shown in the footer (ARCHITECTURE.md "Compliance"). */
export const companySettingsSchema = z.object({
  name: z.string().trim().min(1),
  legal_name: optionalText,
  tax_code: optionalText,
  tour_operator_licence: optionalText,
  ecommerce_notification_url: notificationUrl,
  address: localized.nullish().transform((value) => value ?? null),
});

/** `settings.contact` (public): hotline, email and chat channels. */
export const contactSettingsSchema = z.object({
  phone: optionalText,
  email: z.email().nullish().transform((value) => value ?? null),
  zalo: optionalText,
  whatsapp: optionalText,
  office_hours: localized.nullish().transform((value) => value ?? null),
});

/** `settings.social` (public, optional): profile URLs. */
export const socialSettingsSchema = z
  .object({
    facebook: optionalUrl,
    instagram: optionalUrl,
    youtube: optionalUrl,
    tiktok: optionalUrl,
  })
  .partial();

export type CompanySettings = z.infer<typeof companySettingsSchema>;
export type ContactSettings = z.infer<typeof contactSettingsSchema>;
export type SocialSettings = z.infer<typeof socialSettingsSchema>;

export type PublicSettings = {
  company: CompanySettings | null;
  contact: ContactSettings | null;
  social: SocialSettings;
};

/** `settings.homepage` (public): the hero text and image, and the picks of decision 18 / ADR-016. */
export const homepageSettingsSchema = z.object({
  hero: z
    .object({
      eyebrow: localized.nullish().transform((value) => value ?? null),
      title: localized.nullish().transform((value) => value ?? null),
      // Optional (Phase 3 cross-stream agreement): without it the hero is the navy band.
      media_id: z.uuid().nullish().transform((value) => value ?? null).catch(null),
    })
    .nullish()
    .transform((value) => value ?? null),
  featured_destination_keys: z.array(z.string()).catch([]).default([]),
  journal_teaser_count: z.number().int().min(0).max(6).catch(3).default(3),
});
export type HomepageSettings = z.infer<typeof homepageSettingsSchema>;

/** `settings.booking_rules` (not public). Stream B reads the cutoff only through `booking_cutoff_days()`. */
export const BOOKING_CUTOFF_DEFAULT = 7;

// Admin input (Phase 2 step 21) -----------------------------------------------------------------------
// Stricter than the read shapes above: these refuse what the readers would silently drop, with
// messages that are keys in `Admin.Settings.errors`. What they store parses with the readers.

const inputText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .nullish()
    .transform((value) => (value ? value : null));
// Stored without empty languages (the readers accept a missing language, not null); null when both are empty.
const inputLocalized = (max: number) =>
  z.object({ vi: inputText(max), en: inputText(max) }).transform(({ vi, en }) =>
    vi || en ? { ...(vi ? { vi } : {}), ...(en ? { en } : {}) } : null,
  );
const inputUrl = (protocol: "https" | "http(s)") =>
  inputText(500).refine((value) => {
    if (!value) return true;
    try {
      const { protocol: actual } = new URL(value);
      return protocol === "https" ? actual === "https:" : actual === "https:" || actual === "http:";
    } catch {
      return false;
    }
  }, protocol === "https" ? "httpsOnly" : "urlInvalid");
const wholeNumber = (min: number, max: number) =>
  z.number("wholeNumber").int("wholeNumber").min(min, "outOfRange").max(max, "outOfRange");

export const companyInputSchema = z.object({
  name: z.string().trim().min(1, "required").max(120, "tooLong"),
  legal_name: inputText(200),
  tax_code: inputText(20).refine((value) => !value || /^\d{10}(-\d{3})?$/.test(value), "taxCodeInvalid"),
  tour_operator_licence: inputText(120),
  ecommerce_notification_url: inputUrl("http(s)"),
  address: inputLocalized(300),
});

export const contactInputSchema = z.object({
  phone: inputText(30).refine((value) => !value || /^\+?[\d\s().-]{6,30}$/.test(value), "phoneInvalid"),
  email: inputText(200).refine((value) => !value || z.email().safeParse(value).success, "emailInvalid"),
  zalo: inputText(30).refine((value) => !value || /^\+?[\d\s().-]{6,30}$/.test(value), "phoneInvalid"),
  whatsapp: inputText(30).refine((value) => !value || /^\+?[\d\s().-]{6,30}$/.test(value), "phoneInvalid"),
  office_hours: inputLocalized(120),
});

export const socialInputSchema = z.object({
  facebook: inputUrl("https"),
  instagram: inputUrl("https"),
  youtube: inputUrl("https"),
  tiktok: inputUrl("https"),
});

/** `settings.bank_account` (never public): the receiving account for VietQR transfers (Phase 4). */
export const bankAccountInputSchema = z.object({
  bank_name: inputText(120),
  // VietQR bank identifier (NAPAS BIN), six digits.
  bank_bin: inputText(6).refine((value) => !value || /^\d{6}$/.test(value), "bankBinInvalid"),
  account_number: inputText(30).refine((value) => !value || /^[0-9A-Za-z]{4,30}$/.test(value), "accountNumberInvalid"),
  account_holder: inputText(120).transform((value) => (value ? value.toUpperCase() : value)),
  branch: inputText(120),
});
export type BankAccountSettings = z.output<typeof bankAccountInputSchema>;

/**
 * The editable part of `settings.booking_rules`; the ADR-016 rules stored next to these
 * (late payment, overdue balance, infants, sales-manager prices) are kept as they are.
 */
export const bookingRulesInputSchema = z
  .object({
    hold_minutes: z.object({ vnpay: wholeNumber(10, 60), bank_transfer: wholeNumber(30, 1440) }),
    balance_reminder_days_before_due: z.array(wholeNumber(1, 60)).min(1, "required").max(5, "tooMany"),
    booking_lookup_link_minutes: wholeNumber(10, 120),
    booking_cutoff_days: wholeNumber(0, 60),
  })
  .transform((value) => ({
    ...value,
    // Highest first, without repeats, as the reminder job reads them.
    balance_reminder_days_before_due: [...new Set(value.balance_reminder_days_before_due)].sort((a, b) => b - a),
  }));

export const homepageInputSchema = z.object({
  hero: z.object({
    eyebrow: inputLocalized(80),
    title: inputLocalized(160),
    media_id: z.uuid().nullable(),
  }),
  featured_destination_keys: z.array(z.string().trim().min(1).max(60)).max(6, "tooMany"),
  journal_teaser_count: wholeNumber(0, 6),
});

export const SETTINGS_SECTIONS = ["company", "contact", "social", "bank_account", "booking_rules", "homepage"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Which keys visitors may read (RLS `is_public`); the database refuses the private two as public. */
export const PUBLIC_SETTINGS: Record<SettingsSection, boolean> = {
  company: true,
  contact: true,
  social: true,
  bank_account: false,
  booking_rules: false,
  homepage: true,
};

export const settingsInputSchemas = {
  company: companyInputSchema,
  contact: contactInputSchema,
  social: socialInputSchema,
  bank_account: bankAccountInputSchema,
  booking_rules: bookingRulesInputSchema,
  homepage: homepageInputSchema,
} as const;

export type SettingsInput = { [K in SettingsSection]: z.input<(typeof settingsInputSchemas)[K]> };

export const saveSettingsSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("company"), value: companyInputSchema }),
  z.object({ section: z.literal("contact"), value: contactInputSchema }),
  z.object({ section: z.literal("social"), value: socialInputSchema }),
  z.object({ section: z.literal("bank_account"), value: bankAccountInputSchema }),
  z.object({ section: z.literal("booking_rules"), value: bookingRulesInputSchema }),
  z.object({ section: z.literal("homepage"), value: homepageInputSchema }),
]);
export type SaveSettingsValues = z.output<typeof saveSettingsSchema>;
