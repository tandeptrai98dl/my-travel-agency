import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => undefined, cacheTag: () => undefined }));

const { parsePublicSettings } = await import("./settings.service");

describe("parsePublicSettings", () => {
  it("validates the seeded shapes", () => {
    const settings = parsePublicSettings([
      {
        key: "company",
        value: { name: "Premium Travel Agency (sample)", legal_name: null, address: { vi: "Hà Nội", en: "Hanoi" } },
      },
      { key: "contact", value: { phone: "+84 24 0000 0000", email: "hello@example.com", zalo: null } },
    ]);
    expect(settings.company?.name).toBe("Premium Travel Agency (sample)");
    expect(settings.company?.tour_operator_licence).toBeNull();
    expect(settings.contact?.zalo).toBeNull();
    expect(settings.social).toEqual({});
  });

  it("turns invalid values into null instead of throwing", () => {
    const settings = parsePublicSettings([
      { key: "company", value: { legal_name: "No name" } },
      { key: "contact", value: { email: "not-an-email" } },
    ]);
    expect(settings.company).toBeNull();
    expect(settings.contact).toBeNull();
  });

  it("drops unsafe links one field at a time", () => {
    const settings = parsePublicSettings([
      {
        key: "company",
        value: { name: "Brand", tax_code: "0100000000", ecommerce_notification_url: "javascript:alert(1)" },
      },
      {
        key: "social",
        value: {
          facebook: "https://facebook.com/brand",
          instagram: "http://instagram.com/brand",
          youtube: "data:text/html,hi",
        },
      },
    ]);
    expect(settings.company?.name).toBe("Brand");
    expect(settings.company?.tax_code).toBe("0100000000");
    expect(settings.company?.ecommerce_notification_url).toBeNull();
    expect(settings.social).toEqual({ facebook: "https://facebook.com/brand", instagram: null, youtube: null });
  });

  it("accepts an http:// Ministry notification link", () => {
    const settings = parsePublicSettings([
      { key: "company", value: { name: "Brand", ecommerce_notification_url: "http://online.gov.vn/Home/WebDetails/1" } },
    ]);
    expect(settings.company?.ecommerce_notification_url).toBe("http://online.gov.vn/Home/WebDetails/1");
  });
});
