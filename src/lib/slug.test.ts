import { describe, expect, it } from "vitest";

import { isValidSlug, slugify } from "./slug";

describe("slugify", () => {
  it("removes Vietnamese diacritics, including đ", () => {
    expect(slugify("Vịnh Hạ Long")).toBe("vinh-ha-long");
    expect(slugify("Đà Lạt – Thành phố ngàn hoa")).toBe("da-lat-thanh-pho-ngan-hoa");
    expect(slugify("Ẩm thực đường phố Sài Gòn")).toBe("am-thuc-duong-pho-sai-gon");
  });

  it("collapses punctuation and trims hyphens", () => {
    expect(slugify("  Kyoto & Nara: 7 days!  ")).toBe("kyoto-nara-7-days");
    expect(slugify("---")).toBe("");
  });

  it("caps the length at a word boundary", () => {
    const slug = slugify("Hành trình ".repeat(20));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
    expect(isValidSlug(slug)).toBe(true);
  });
});

describe("isValidSlug", () => {
  it("accepts only lower-case ASCII words joined by single hyphens", () => {
    expect(isValidSlug("vinh-ha-long")).toBe(true);
    expect(isValidSlug("Vinh-Ha-Long")).toBe(false);
    expect(isValidSlug("vinh--ha")).toBe(false);
    expect(isValidSlug("-vinh")).toBe(false);
    expect(isValidSlug("vịnh")).toBe(false);
  });
});
