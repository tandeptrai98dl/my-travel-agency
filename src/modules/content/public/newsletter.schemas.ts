import { z } from "zod";

/** Version of the newsletter consent text recorded in `consent_records` (Decree 13/2023 proof). */
export const NEWSLETTER_CONSENT_VERSION = "newsletter-2026-11";
/** How long a confirmation link stays valid. */
export const CONFIRM_TOKEN_DAYS = 7;

export const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  locale: z.enum(["vi", "en"]),
  turnstileToken: z.string().max(2048).default(""),
  // Honeypot: a hidden field people never fill in.
  website: z.string().max(200).default(""),
});

export const confirmSchema = z.object({
  token: z.string().min(20).max(200).regex(/^[0-9a-z]+\.[A-Za-z0-9_-]+$/),
});

export type SubscribeStatus = "idle" | "sent" | "invalidEmail" | "verification" | "rateLimited" | "unavailable" | "failed";
export type ConfirmStatus = "idle" | "confirmed" | "invalid" | "unavailable";
