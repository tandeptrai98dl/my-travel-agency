import { z } from "zod";

const localized = z.object({ vi: z.string().optional(), en: z.string().optional() }).partial();
const optionalText = z.string().trim().min(1).nullish().transform((value) => value ?? null);
const optionalUrl = z.url().nullish().transform((value) => value ?? null);

/** `settings.company` (public): legal details shown in the footer (ARCHITECTURE.md "Compliance"). */
export const companySettingsSchema = z.object({
  name: z.string().trim().min(1),
  legal_name: optionalText,
  tax_code: optionalText,
  tour_operator_licence: optionalText,
  ecommerce_notification_url: optionalUrl,
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
