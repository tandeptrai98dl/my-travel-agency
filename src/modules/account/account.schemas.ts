import { z } from "zod";

/**
 * Account area inputs (docs/specs/phase-5-accounts-inquiries-operations.md decision 4). Messages
 * are translation keys (`Account.errors.*`). The database checks the same rules again
 * (`save_customer_travellers()`).
 */

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .transform((value) => value || null);

export const profileSchema = z.object({
  fullName: z.string().trim().min(1, "required").max(120, "tooLong"),
  phone: optional(30).pipe(z.string().regex(/^[+0-9 ().-]{6,30}$/, "invalidPhone").nullable()),
  country: optional(60),
  locale: z.enum(["vi", "en"]),
});

export const marketingSchema = z.object({
  marketing: z
    .literal("on")
    .optional()
    .transform((value) => value === "on"),
  locale: z.enum(["vi", "en"]),
});

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const travellerSchema = z.object({
  fullName: z.string().trim().min(1, "required").max(120, "tooLong"),
  dateOfBirth: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.string().regex(isoDate, "invalidDate").nullable()),
  nationality: optional(60),
  dietaryNotes: optional(500),
});

export const travellersSchema = z.object({
  code: z.string().regex(/^PTA-\d{4}-\d{4,}$/),
  travellers: z.array(travellerSchema).max(50),
  lead: z.coerce.number().int().min(0),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type TravellersInput = z.infer<typeof travellersSchema>;
