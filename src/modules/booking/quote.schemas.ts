import { z } from "zod";

// Messages are keys in `Admin.Bookings.errors`.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid");
const money = z.number("amountInvalid").int("amountInvalid").min(0, "amountInvalid").max(10_000_000_000, "amountInvalid");

/** A private-tour quote from sales (spec Phase 4 step 13). Prices are the staff's final prices. */
export const createQuoteSchema = z
  .object({
    tourId: z.uuid("required"),
    startDate: isoDate,
    locale: z.enum(["vi", "en"]),
    adults: z.number().int().min(1, "outOfRange").max(50, "outOfRange"),
    children: z.number().int().min(0, "outOfRange").max(50, "outOfRange"),
    infants: z.number().int().min(0, "outOfRange").max(25, "outOfRange"),
    priceAdult: money.refine((value) => value > 0, "amountInvalid"),
    priceChild: money.nullable(),
    plan: z.enum(["deposit", "full"]),
    validDays: z.number().int().min(1, "outOfRange").max(30, "outOfRange"),
    contactName: z.string().trim().min(1, "required").max(120, "tooLong"),
    contactEmail: z.string().trim().toLowerCase().max(200, "tooLong").pipe(z.email("emailInvalid")),
    contactPhone: z.string().trim().regex(/^\+?[\d\s().-]{6,30}$/, "phoneInvalid"),
    specialRequests: z.string().trim().max(2000, "tooLong"),
    inquiryCode: z.string().trim().max(40, "tooLong"),
  })
  .refine((value) => value.infants * 2 <= value.adults, { path: ["infants"], message: "tooManyInfants" })
  .refine((value) => value.children === 0 || (value.priceChild ?? 0) > 0, { path: ["priceChild"], message: "amountInvalid" });
export type CreateQuoteInput = z.input<typeof createQuoteSchema>;
export type CreateQuoteValues = z.output<typeof createQuoteSchema>;

export const createPaymentLinkSchema = z.object({
  bookingId: z.uuid(),
  validHours: z.number().int().min(1, "outOfRange").max(168, "outOfRange"),
});
export type CreatePaymentLinkValues = z.output<typeof createPaymentLinkSchema>;

/** Payment-link tokens: 32 random bytes, base64url (43 characters). */
export const paymentLinkTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export type QuoteActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fields?: Record<string, string> };

export type PaymentLinkResult =
  | { ok: true; url: string; amount: number; expiresAt: string; email: "sent" | "skipped" | "failed" }
  | { ok: false; error: string; fields?: Record<string, string> };

/** Errors raised by create_quote() and create_payment_link(), as message keys. */
export function quoteErrorCode(error: { code?: string; message?: string } | null): string {
  if (!error) return "failed";
  if (error.code === "42501") return "forbidden";
  if (error.code === "P0002") return "not_found";
  if (error.code === "23505") return "inquiryTaken";
  const known = ["invalid_quote", "plan_unavailable", "invalid_link", "not_payable"];
  return known.includes(error.message ?? "") ? (error.message as string) : "failed";
}
