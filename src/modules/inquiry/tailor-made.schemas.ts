import { z } from "zod";

import { CONTACT_CHANNELS } from "./contact.schemas";

/**
 * Tailor-made wizard and private-tour inquiry form (Phase 5 PR 5W). Fields map to existing
 * `inquiries` columns; `create_tailor_made_inquiry()` checks the same rules again.
 */
export const INQUIRY_SOURCES = ["tailor_made", "tour_inquiry"] as const;
export const BUDGETS = ["under_30m", "30_60m", "60_100m", "100_200m", "over_200m", "not_sure"] as const;
export const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .default("")
    .transform((value) => value || null);

const count = (min: number, max: number) => z.coerce.number({ error: "invalid" }).int("invalid").min(min, "invalid").max(max, "invalid");

const key = z.string().trim().max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const inquirySchema = z.object({
  source: z.enum(INQUIRY_SOURCES),
  locale: z.enum(["vi", "en"]),
  destinations: z.array(key).max(20).default([]),
  destinationsOther: text(300),
  travelMonth: z
    .string()
    .trim()
    .regex(/^(\d{4}-(0[1-9]|1[0-2]))?$/, "invalid")
    .default("")
    .transform((value) => value || null),
  flexibleDates: z.boolean().default(true),
  durationDays: z.union([z.literal("").transform(() => null), count(1, 60)]).default(null),
  adults: count(1, 50),
  children: count(0, 50).default(0),
  budget: z
    .union([z.enum(BUDGETS), z.literal("")])
    .default("")
    .transform((value) => value || null),
  travelStyle: z
    .union([key, z.literal("")])
    .default("")
    .transform((value) => value || null),
  tourCode: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Z0-9-]*$/)
    .default("")
    .transform((value) => value || null)
    .catch(null),
  name: z.string().trim().min(1, "required").max(120, "tooLong"),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("invalidEmail")),
  phone: text(30).pipe(z.string().regex(/^[+0-9 ().-]{6,30}$/, "invalidPhone").nullable()),
  preferredContact: z.enum(CONTACT_CHANNELS).default("email"),
  companyName: text(160),
  country: text(80),
  message: text(4000),
  utm: z.partialRecord(z.enum(UTM_KEYS), z.string().trim().max(100)).catch({}),
  consent: z.literal("on", { error: "consentRequired" }),
  turnstileToken: z.string().max(2048).default(""),
  website: z.string().max(200).default(""),
});

export type InquiryInput = z.infer<typeof inquirySchema>;
export const INQUIRY_FIELDS = ["destinations", "travelMonth", "durationDays", "adults", "children", "budget", "name", "email", "phone", "companyName", "country", "message", "consent"] as const;
export type InquiryField = (typeof INQUIRY_FIELDS)[number];
export type InquiryStatus = "idle" | "sent" | "invalid" | "verification" | "rateLimited" | "unavailable" | "failed";
export type InquiryState = { status: InquiryStatus; code?: string; errors?: Partial<Record<InquiryField, string>> };

/** The payload of `create_tailor_made_inquiry()` (snake_case, as the function reads it). */
export function inquiryPayload(input: InquiryInput) {
  return {
    source: input.source,
    locale: input.locale,
    name: input.name,
    email: input.email,
    phone: input.phone,
    preferred_contact: input.preferredContact,
    company_name: input.companyName,
    country: input.country,
    destination_keys: input.destinations,
    destinations_other: input.destinationsOther,
    travel_style: input.travelStyle,
    tour_code: input.tourCode,
    travel_month: input.travelMonth,
    flexible_dates: input.flexibleDates,
    duration_days: input.durationDays,
    adults: input.adults,
    children: input.children,
    budget_per_person: input.budget,
    message: input.message,
    utm: input.utm,
  };
}
