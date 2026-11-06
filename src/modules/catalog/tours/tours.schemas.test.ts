import { describe, expect, it } from "vitest";

import { newTourSchema, type TourInput, tourSchema } from "./tours.schemas";

const translation = (overrides: Partial<TourInput["translations"]["vi"]> = {}): TourInput["translations"]["vi"] => ({
  slug: "du-thuyen-vinh-ha-long",
  title: "Du thuyền vịnh Hạ Long",
  subtitle: "",
  summary: "Hai đêm trên du thuyền nhỏ.",
  highlights: ["Chèo kayak", ""],
  itinerary: [{ title: "Hà Nội – vịnh Lan Hạ", description: "", meals: ["lunch"], accommodation: "" }],
  inclusions: [],
  exclusions: [],
  practicalInfo: "",
  faqs: [],
  seoTitle: "",
  seoDescription: "Du thuyền hai đêm trên vịnh Lan Hạ.",
  ogMediaId: null,
  isPublished: true,
  ...overrides,
});
const empty = translation({ slug: "", title: "", summary: "", itinerary: [], highlights: [], seoDescription: "", isPublished: false });
const tour = (overrides: Partial<TourInput> = {}): TourInput => ({
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  code: "VN-HLB-03",
  type: "group",
  scope: "domestic",
  status: "published",
  durationDays: 3,
  durationNights: 2,
  minPax: 1,
  maxPax: 16,
  minPaxToOperate: 6,
  childAgeMax: 11,
  infantAgeMax: 1,
  isFeatured: true,
  heroMediaId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  galleryIds: [],
  destinationIds: [],
  travelStyleIds: [],
  prices: null,
  translations: { vi: translation(), en: empty },
  ...overrides,
});

const issues = (input: unknown) => {
  const result = tourSchema.safeParse(input);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("tour schema", () => {
  it("accepts a complete published tour and drops empty list lines", () => {
    const parsed = tourSchema.parse(tour());
    expect(parsed.translations.vi.highlights).toEqual(["Chèo kayak"]);
    expect(parsed.translations.vi.subtitle).toBeNull();
  });

  it("parses its own output again (the Server Action re-parses)", () => {
    expect(tourSchema.safeParse(tourSchema.parse(tour())).success).toBe(true);
  });

  it("needs a published language and a hero to publish (decision 3)", () => {
    expect(issues(tour({ translations: { vi: translation({ isPublished: false }), en: empty } }))).toMatchObject({
      status: "publishNeedsTranslation",
    });
    expect(issues(tour({ heroMediaId: null }))).toMatchObject({ heroMediaId: "publishNeedsHero" });
    expect(issues(tour({ status: "draft", heroMediaId: null }))).toEqual({});
  });

  it("needs an SEO description to publish a language, and a summary for any saved language", () => {
    expect(issues(tour({ translations: { vi: translation({ seoDescription: "" }), en: empty } }))).toMatchObject({
      "translations.vi.seoDescription": "requiredToPublish",
    });
    expect(
      issues(tour({ status: "draft", translations: { vi: translation({ summary: "", isPublished: false }), en: empty } })),
    ).toMatchObject({ "translations.vi.summary": "required" });
  });

  it("checks codes, durations, group sizes and ages", () => {
    expect(issues(tour({ code: "vn hlb" }))).toMatchObject({ code: "codeInvalid" });
    expect(issues(tour({ durationNights: 4 }))).toMatchObject({ durationNights: "nightsAfterDays" });
    expect(issues(tour({ minPax: 5, maxPax: 2 }))).toMatchObject({ maxPax: "maxBelowMin" });
    expect(issues(tour({ infantAgeMax: 11 }))).toMatchObject({ infantAgeMax: "infantAge" });
  });

  it("requires every itinerary day to have a title", () => {
    const day = { title: "", description: "", meals: [], accommodation: "" };
    expect(issues(tour({ translations: { vi: translation({ itinerary: [day] }), en: empty } }))).toMatchObject({
      "translations.vi.itinerary.0.title": "required",
    });
  });

  it("validates prices only as whole numbers in range", () => {
    const prices = { fromPrice: 12_900_000, depositPercent: 30, balanceDueDays: 30, cancellationPolicyId: null };
    expect(issues(tour({ prices }))).toEqual({});
    expect(issues(tour({ prices: { ...prices, depositPercent: 120 } }))).toMatchObject({ "prices.depositPercent": "outOfRange" });
    expect(issues(tour({ prices: { ...prices, fromPrice: 1.5 } }))).toMatchObject({ "prices.fromPrice": "wholeNumber" });
  });

  it("creates drafts from a title and the key facts", () => {
    expect(
      newTourSchema.safeParse({ code: "VN-NEW-01", type: "private", scope: "domestic", durationDays: 2, durationNights: 1, title: "Mới" })
        .success,
    ).toBe(true);
  });
});
