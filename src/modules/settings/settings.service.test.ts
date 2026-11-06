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
});
