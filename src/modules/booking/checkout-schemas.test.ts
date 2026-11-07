import { describe, expect, it } from "vitest";

import { checkoutDraftSchema, startCheckoutPaymentSchema } from "./booking.schemas";

const base = {
  idempotencyKey: "0f8fad5b-d9cb-469f-a165-70867728950e",
  departureId: "11111111-1111-4111-8111-111111111111",
  locale: "vi",
  party: { adults: 2, children: 0, infants: 0, singleRooms: 0 },
  plan: "full",
  contact: { name: "Trần Thu Hà", email: "HA@Example.test", phone: "+84 912 345 678", country: "", specialRequests: "" },
  invoice: null,
  acceptTerms: true,
};

describe("checkout schemas", () => {
  it("needs the terms accepted; marketing is off unless ticked", () => {
    const parsed = checkoutDraftSchema.parse(base);
    expect(parsed.marketing).toBe(false);
    expect(parsed.contact.email).toBe("ha@example.test");
    expect(parsed.contact.country).toBeNull();
    const refused = checkoutDraftSchema.safeParse({ ...base, acceptTerms: false });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]).toMatchObject({ path: ["acceptTerms"], message: "termsRequired" });
  });

  it("never takes a price from the browser", () => {
    const parsed = checkoutDraftSchema.parse({ ...base, total: 1, subtotal: 1 } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("total");
    expect(parsed).not.toHaveProperty("subtotal");
  });

  it("checks the invoice tax code and the payment start input", () => {
    const invoice = { companyName: "Công ty A", taxCode: "123", address: "Hà Nội", email: "ketoan@example.test" };
    expect(checkoutDraftSchema.safeParse({ ...base, invoice }).error?.issues[0].message).toBe("taxCodeInvalid");
    expect(checkoutDraftSchema.safeParse({ ...base, invoice: { ...invoice, taxCode: "0101234567-001" } }).success).toBe(true);
    expect(startCheckoutPaymentSchema.safeParse({ code: "PTA-2611-0042", provider: "vnpay" }).success).toBe(true);
    expect(startCheckoutPaymentSchema.safeParse({ code: "PTA-2611-0042", provider: "cash" }).success).toBe(false);
    expect(startCheckoutPaymentSchema.safeParse({ code: "../admin", provider: "vnpay" }).success).toBe(false);
  });
});
