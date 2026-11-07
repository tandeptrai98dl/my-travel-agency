import { z } from "zod";

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
  // The confirmation page's language: the privacy policy shown there is the one agreed to.
  locale: z.enum(["vi", "en"]),
});

export type SubscribeStatus = "idle" | "sent" | "invalidEmail" | "verification" | "rateLimited" | "unavailable" | "failed";
export type ConfirmStatus = "idle" | "confirmed" | "invalid" | "unavailable";
