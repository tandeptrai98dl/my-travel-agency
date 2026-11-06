import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/public", () => ({
  publicEnv: { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS: false },
}));

import { imageWithAlt, pickTestimonial, toDestinations, toHero, toPosts, toTravelStyles } from "./homepage.mapping";
import { homepageSettingSchema } from "./homepage.schemas";

const HERO_ID = "7f1d2a52-3c1f-4c55-9a43-5b8b8b2f0c11";
const media = (overrides: Record<string, unknown> = {}) => ({
  id: HERO_ID,
  path: "2026/01/hero.jpg",
  width: 2400,
  height: 1350,
  alt: { vi: "Vịnh Hạ Long lúc bình minh", en: "Ha Long Bay at dawn" },
  blur_data_url: "data:image/webp;base64,AAA",
  ...overrides,
});

describe("homepage setting", () => {
  it("reads the agreed shape", () => {
    const setting = homepageSettingSchema.parse({
      hero: { eyebrow: { vi: "Hành trình riêng tư" }, title: { vi: "Tiêu đề", en: "Title" }, media_id: HERO_ID },
      featured_destination_keys: ["vietnam", "japan"],
      journal_teaser_count: 2,
    });
    expect(setting.hero?.media_id).toBe(HERO_ID);
    expect(setting.featured_destination_keys).toEqual(["vietnam", "japan"]);
    expect(setting.journal_teaser_count).toBe(2);
  });

  it("falls back field by field instead of failing", () => {
    const setting = homepageSettingSchema.parse({
      hero: { title: "not localized", media_id: "not-a-uuid" },
      featured_destination_keys: "vietnam",
      journal_teaser_count: 99,
    });
    expect(setting.hero).toEqual({ eyebrow: null, title: null, media_id: null });
    expect(setting.featured_destination_keys).toEqual([]);
    expect(setting.journal_teaser_count).toBe(3);
    expect(homepageSettingSchema.parse(null)).toEqual({ hero: null, featured_destination_keys: [], journal_teaser_count: 3 });
  });
});

describe("hero", () => {
  const setting = homepageSettingSchema.parse({
    hero: { eyebrow: { vi: "Hành trình riêng tư", en: "Private journeys" }, title: { vi: "Tiêu đề" }, media_id: HERO_ID },
  });

  it("uses the image with this language's alt text", () => {
    const hero = toHero(setting, "en", media());
    expect(hero.image?.alt).toBe("Ha Long Bay at dawn");
    expect(hero.image?.src).toBe("https://proj.supabase.co/storage/v1/object/public/media/2026/01/hero.jpg");
    expect(hero.eyebrow).toBe("Private journeys");
    expect(hero.title).toBeNull();
  });

  it.each([
    ["a missing media row", null],
    ["another media row", media({ id: "00000000-0000-4000-8000-000000000000" })],
    ["no alt text in this language", media({ alt: { vi: "Vịnh Hạ Long", en: "  " } })],
    ["no alt text at all", media({ alt: null })],
    ["an empty path", media({ path: "" })],
  ])("falls back to the navy band for %s", (_, row) => {
    expect(toHero(setting, "en", row).image).toBeNull();
  });

  it("has no image when the setting has none", () => {
    expect(toHero(homepageSettingSchema.parse({}), "vi", media()).image).toBeNull();
  });
});

describe("sections", () => {
  it("lists featured destinations in the setting's order, published translations only", () => {
    const rows = [
      { key: "japan", hero: null, destination_translations: [{ locale: "vi", slug: "nhat-ban", name: "Nhật Bản", summary: "Đền chùa", best_time_to_visit: "Tháng 4" }] },
      { key: "vietnam", hero: media(), destination_translations: [{ locale: "vi", slug: "viet-nam", name: "Việt Nam", summary: null, best_time_to_visit: null }] },
      { key: "france", hero: null, destination_translations: [{ locale: "vi", slug: "phap", name: " " }] },
    ];
    const list = toDestinations(["vietnam", "france", "japan", "peru"], rows, "vi");
    expect(list.map((item) => item.key)).toEqual(["vietnam", "japan"]);
    expect(list[0].image?.alt).toBe("Vịnh Hạ Long lúc bình minh");
    expect(list[1]).toMatchObject({ slug: "nhat-ban", name: "Nhật Bản", summary: "Đền chùa", bestTime: "Tháng 4", image: null });
  });

  it("maps travel styles and drops those without a name", () => {
    const rows = [
      { key: "honeymoon", hero: null, travel_style_translations: [{ locale: "en", slug: "honeymoon", name: "Honeymoon", description: "For two" }] },
      { key: "family", hero: null, travel_style_translations: [{ locale: "en", slug: "family", name: "" }] },
    ];
    expect(toTravelStyles(rows, "en")).toEqual([{ key: "honeymoon", slug: "honeymoon", name: "Honeymoon", description: "For two", image: null }]);
  });

  it("prefers a featured review written in this language", () => {
    const base = { author_country: null, rating: 5, title: null, is_verified: false };
    const rows = [
      { ...base, id: "1", author_name: "Anna", content: "Wonderful", locale: "en" as const },
      { ...base, id: "2", author_name: "Lan", content: "Tuyệt vời", locale: "vi" as const, rating: 7 },
    ];
    expect(pickTestimonial(rows, "vi")).toMatchObject({ id: "2", rating: 5 });
    expect(pickTestimonial(rows, "en")?.id).toBe("1");
    expect(pickTestimonial([rows[0]], "vi")?.id).toBe("1");
    expect(pickTestimonial([{ ...rows[0], content: " " }], "en")).toBeNull();
  });

  it("dates articles in Vietnam time", () => {
    const posts = toPosts(
      [{ published_at: "2026-11-06T18:30:00Z", cover: null, post_translations: [{ locale: "vi", slug: "mua-thu", title: "Mùa thu", excerpt: null }] }],
      "vi",
    );
    expect(posts).toEqual([{ slug: "mua-thu", title: "Mùa thu", excerpt: null, publishedAt: "2026-11-07", image: null }]);
  });

  it("never returns an image without alt text", () => {
    expect(imageWithAlt(media({ alt: { vi: "Ảnh" } }), "en")).toBeNull();
    expect(imageWithAlt(undefined, "vi")).toBeNull();
  });
});
