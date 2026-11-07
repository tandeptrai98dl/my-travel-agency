import { z } from "zod";

export const CONTACT_CHANNELS = ["email", "phone", "zalo", "whatsapp"] as const;

const optionalText = z
  .string()
  .trim()
  .max(30)
  .transform((value) => value || null);

export const contactSchema = z.object({
  name: z.string().trim().min(1, "required").max(120, "tooLong"),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("invalidEmail")),
  phone: optionalText.pipe(z.string().regex(/^[+0-9 ().-]{6,30}$/, "invalidPhone").nullable()),
  preferredContact: z.enum(CONTACT_CHANNELS).default("email"),
  message: z.string().trim().min(10, "tooShort").max(4000, "tooLong"),
  // A tour code from the tour page's call to action (`/lien-he?tour=…`); checked again in SQL.
  tourCode: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Z0-9-]*$/)
    .transform((value) => value || null)
    .catch(null),
  consent: z.literal("on", { error: "consentRequired" }),
  locale: z.enum(["vi", "en"]),
  turnstileToken: z.string().max(2048).default(""),
  website: z.string().max(200).default(""),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type ContactField = "name" | "email" | "phone" | "message" | "consent";
export type ContactStatus = "idle" | "sent" | "invalid" | "verification" | "rateLimited" | "unavailable" | "failed";
