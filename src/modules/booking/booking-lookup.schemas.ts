import { z } from "zod";

/** Guest booking lookup (spec Phase 5 decision 7). Messages are keys of the auth form's errors. */
export const bookingLookupSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^PTA-\d{4}-\d{4,6}$/, "invalidCode"),
  email: z.string().trim().toLowerCase().max(254, "tooLong").pipe(z.email("invalidEmail")),
  locale: z.enum(["vi", "en"]),
  turnstileToken: z.string().max(2048).default(""),
});
export type BookingLookupInput = z.output<typeof bookingLookupSchema>;
