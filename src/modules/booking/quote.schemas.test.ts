import { describe, expect, it } from "vitest";

import { createQuoteSchema, paymentLinkTokenSchema, quoteErrorCode } from "./quote.schemas";

const base = {
  tourId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  startDate: "2027-03-01",
  locale: "en",
  adults: 2,
  children: 0,
  infants: 0,
  priceAdult: 20_000_000,
  priceChild: null,
  plan: "deposit",
  validDays: 7,
  contactName: "Anna Berg",
  contactEmail: "Anna@Example.test",
  contactPhone: "+46 70 000 00 00",
  specialRequests: "",
  inquiryCode: "",
};

describe("quote schemas", () => {
  it("accepts a complete quote and normalises the email", () => {
    expect(createQuoteSchema.parse(base).contactEmail).toBe("anna@example.test");
  });

  it("needs a child price for children, a price per adult and the infant rule", () => {
    expect(createQuoteSchema.safeParse({ ...base, children: 1 }).error?.issues[0]).toMatchObject({ path: ["priceChild"], message: "amountInvalid" });
    expect(createQuoteSchema.safeParse({ ...base, priceAdult: 0 }).success).toBe(false);
    expect(createQuoteSchema.safeParse({ ...base, adults: 1, infants: 1 }).error?.issues[0]).toMatchObject({ path: ["infants"], message: "tooManyInfants" });
    expect(createQuoteSchema.safeParse({ ...base, validDays: 31 }).success).toBe(false);
  });

  it("recognises payment-link tokens and maps database errors", () => {
    expect(paymentLinkTokenSchema.safeParse("A".repeat(43)).success).toBe(true);
    expect(paymentLinkTokenSchema.safeParse("A".repeat(42)).success).toBe(false);
    expect(quoteErrorCode({ code: "42501" })).toBe("forbidden");
    expect(quoteErrorCode({ code: "23505" })).toBe("inquiryTaken");
    expect(quoteErrorCode({ code: "P0001", message: "plan_unavailable" })).toBe("plan_unavailable");
    expect(quoteErrorCode({ code: "P0001", message: "other" })).toBe("failed");
  });
});
