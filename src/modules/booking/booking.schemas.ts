import { z } from "zod";

/** Input of the book-now flow (PR 4B builds the forms on these). Prices are never part of it. */
export const partySchema = z.object({
  adults: z.number().int().min(1).max(50),
  children: z.number().int().min(0).max(50),
  infants: z.number().int().min(0).max(25),
  singleRooms: z.number().int().min(0).max(50),
});

export const contactSchema = z.object({
  name: z.string().trim().min(1, "required").max(120, "tooLong"),
  email: z.string().trim().toLowerCase().max(200, "tooLong").pipe(z.email("emailInvalid")),
  phone: z.string().trim().regex(/^\+?[\d\s().-]{6,30}$/, "phoneInvalid"),
  country: z.string().trim().max(80).nullish().transform((value) => value || null),
  specialRequests: z.string().trim().max(2000, "tooLong").nullish().transform((value) => value || null),
});

export const invoiceSchema = z
  .object({
    companyName: z.string().trim().min(1, "required").max(200, "tooLong"),
    taxCode: z.string().trim().regex(/^\d{10}(-\d{3})?$/, "taxCodeInvalid"),
    address: z.string().trim().min(1, "required").max(300, "tooLong"),
    email: z.string().trim().toLowerCase().max(200).pipe(z.email("emailInvalid")),
  })
  .nullable();

export const draftInputSchema = z.object({
  idempotencyKey: z.uuid(),
  departureId: z.uuid(),
  locale: z.enum(["vi", "en"]),
  party: partySchema,
  plan: z.enum(["deposit", "full"]),
  contact: contactSchema,
  invoice: invoiceSchema.default(null),
});
export type DraftInput = z.input<typeof draftInputSchema>;
export type DraftValues = z.output<typeof draftInputSchema>;

export const startPaymentSchema = z.object({
  bookingId: z.uuid(),
  provider: z.enum(["vnpay", "bank_transfer"]),
  kind: z.enum(["deposit", "full", "balance"]),
});
export type StartPaymentValues = z.output<typeof startPaymentSchema>;
