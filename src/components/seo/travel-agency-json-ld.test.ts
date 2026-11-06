import { describe, expect, it } from "vitest";

import { travelAgencyJsonLd } from "./travel-agency-json-ld";

describe("travelAgencyJsonLd", () => {
  it("lists only the fields that are set", () => {
    const data = travelAgencyJsonLd({
      settings: { company: null, contact: null, social: {} },
      locale: "vi",
      name: "Brand",
      url: "https://example.com/",
    });
    expect(data).toEqual({ "@context": "https://schema.org", "@type": ["TravelAgency", "Organization"], name: "Brand", url: "https://example.com/" });
  });

  it("adds company, contact, address and social profiles", () => {
    const data = travelAgencyJsonLd({
      settings: {
        company: {
          name: "Brand",
          legal_name: "Công ty TNHH Brand",
          tax_code: "0100000000",
          tour_operator_licence: null,
          ecommerce_notification_url: null,
          address: { vi: "1 Tràng Tiền, Hà Nội", en: "1 Trang Tien, Hanoi" },
        },
        contact: { phone: "+84 24 0000 0000", email: "hello@example.com", zalo: null, whatsapp: null, office_hours: null },
        social: { facebook: "https://facebook.com/brand", instagram: null },
      },
      locale: "en",
      name: "Brand",
      url: "https://example.com/en",
    });
    expect(data).toMatchObject({
      legalName: "Công ty TNHH Brand",
      taxID: "0100000000",
      telephone: "+84 24 0000 0000",
      email: "hello@example.com",
      address: { "@type": "PostalAddress", streetAddress: "1 Trang Tien, Hanoi", addressCountry: "VN" },
      sameAs: ["https://facebook.com/brand"],
    });
  });
});
