import { describe, expect, it } from "vitest";

import { cancellationRulesSchema, destinationSchema, travelStyleSchema } from "./taxonomy.schemas";

const translation = (overrides: Record<string, unknown> = {}) => ({
  slug: "vinh-ha-long",
  name: "Vịnh Hạ Long",
  summary: "Gần hai nghìn đảo đá vôi.",
  bestTimeToVisit: "",
  seoTitle: "",
  seoDescription: "",
  isPublished: true,
  ...overrides,
});
const empty = { slug: "", name: "", summary: "", bestTimeToVisit: "", seoTitle: "", seoDescription: "", isPublished: false };
const destination = (overrides: Record<string, unknown> = {}) => ({
  key: "ha-long-bay",
  type: "city",
  parentId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  status: "published",
  heroMediaId: null,
  latitude: 20.91,
  longitude: 107.18,
  sortOrder: 2,
  translations: { vi: translation(), en: empty },
  ...overrides,
});
const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((result.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));

describe("destinationSchema", () => {
  it("accepts a published Vietnamese translation and an English one left empty", () => {
    const parsed = destinationSchema.parse(destination());
    expect(parsed.translations.en.name).toBe("");
    expect(parsed.translations.vi.bestTimeToVisit).toBeNull();
  });

  it("needs a Vietnamese name, a valid slug once named, and a summary to publish", () => {
    const result = destinationSchema.safeParse(
      destination({
        key: "Hạ Long",
        latitude: 120,
        translations: { vi: translation({ name: "" }), en: translation({ slug: "Ha Long", summary: "" }) },
      }),
    );
    expect(issues(result)).toMatchObject({
      key: "keyInvalid",
      latitude: "outOfRange",
      "translations.vi.name": "required",
      "translations.en.slug": "slugInvalid",
      "translations.en.summary": "requiredToPublish",
    });
  });
});

describe("travelStyleSchema", () => {
  it("needs a description to publish", () => {
    const result = travelStyleSchema.safeParse({
      key: "honeymoon",
      status: "draft",
      heroMediaId: null,
      sortOrder: 1,
      translations: {
        vi: { slug: "trang-mat", name: "Trăng mật", description: "", seoTitle: "", seoDescription: "", isPublished: true },
        en: { slug: "", name: "", description: "", seoTitle: "", seoDescription: "", isPublished: false },
      },
    });
    expect(issues(result)).toEqual({ "translations.vi.description": "requiredToPublish" });
  });
});

describe("cancellationRulesSchema", () => {
  it("accepts decreasing days with non-increasing refunds ending at day 0", () => {
    expect(
      cancellationRulesSchema.safeParse([
        { minDaysBefore: 30, refundPercent: 80 },
        { minDaysBefore: 15, refundPercent: 50 },
        { minDaysBefore: 0, refundPercent: 0 },
      ]).success,
    ).toBe(true);
  });

  it("explains each broken rule", () => {
    const result = cancellationRulesSchema.safeParse([
      { minDaysBefore: 15, refundPercent: 50 },
      { minDaysBefore: 30, refundPercent: 80 },
      { minDaysBefore: 7, refundPercent: 20 },
    ]);
    expect(issues(result)).toEqual({
      "1.minDaysBefore": "daysOrder",
      "1.refundPercent": "refundOrder",
      "2.minDaysBefore": "lastRuleDayZero",
    });
    expect(issues(cancellationRulesSchema.safeParse([{ minDaysBefore: 0, refundPercent: 20.5 }]))).toEqual({
      "0.refundPercent": "wholeNumber",
    });
  });
});
