import { describe, expect, it } from "vitest";

import { categorySchema, pageSchema, postSchema } from "./content.schemas";

const IMG = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const body = (text = "Một buổi sáng ở Hội An.") => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const translation = (overrides: Record<string, unknown> = {}) => ({
  slug: "pho-co",
  title: "Phố cổ",
  excerpt: "",
  content: body(),
  seoTitle: "",
  seoDescription: "Mô tả.",
  isPublished: true,
  ...overrides,
});
const empty = { slug: "", title: "", excerpt: "", content: { type: "doc", content: [{ type: "paragraph" }] }, seoTitle: "", seoDescription: "", isPublished: false };
const post = (overrides: Record<string, unknown> = {}) => ({
  status: "published",
  categoryId: null,
  coverMediaId: IMG,
  translations: { vi: translation(), en: empty },
  ...overrides,
});
const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`) ?? [];

describe("post schema", () => {
  it("accepts an article, sanitizes its rich text and parses its own output again", () => {
    const parsed = postSchema.parse(
      post({
        translations: {
          vi: translation({ content: { type: "doc", content: [{ type: "script", text: "x" }, ...body().content] } }),
          en: empty,
        },
      }),
    );
    expect(parsed.translations.vi.content).toEqual(body());
    expect(parsed.translations.vi.excerpt).toBeNull();
    expect(postSchema.parse(parsed)).toEqual(parsed);
  });

  it("needs content, an SEO description and a cover to publish", () => {
    expect(issues(postSchema.safeParse(post({ coverMediaId: null })))).toEqual(["coverMediaId:publishNeedsCover"]);
    expect(
      issues(postSchema.safeParse(post({ translations: { vi: translation({ content: empty.content, seoDescription: "" }), en: empty } }))),
    ).toEqual(["translations.vi.content:requiredToPublish", "translations.vi.seoDescription:requiredToPublish"]);
    expect(
      issues(postSchema.safeParse(post({ translations: { vi: translation({ isPublished: false }), en: empty } }))),
    ).toEqual(["status:publishNeedsTranslation"]);
  });

  it("lets a draft keep an unfinished language, but not one without a Vietnamese title", () => {
    expect(postSchema.safeParse(post({ status: "draft", coverMediaId: null, translations: { vi: translation({ isPublished: false, seoDescription: "" }), en: empty } })).success).toBe(true);
    expect(issues(postSchema.safeParse(post({ status: "draft", translations: { vi: empty, en: translation({ slug: "old-quarter" }) } })))).toEqual([
      "translations.vi.title:required",
    ]);
  });

  it("refuses an oversized document and a bad slug", () => {
    const huge = body("x".repeat(400_000));
    expect(issues(postSchema.safeParse(post({ translations: { vi: translation({ content: huge }), en: empty } })))).toContain(
      "translations.vi.content:tooLong",
    );
    expect(issues(postSchema.safeParse(post({ translations: { vi: translation({ slug: "Phố Cổ" }), en: empty } })))).toEqual([
      "translations.vi.slug:slugInvalid",
    ]);
  });
});

describe("page and category schemas", () => {
  it("accepts only the fixed page keys", () => {
    const page = { key: "terms", status: "published", translations: { vi: translation({ slug: "dieu-khoan" }), en: empty } };
    expect(pageSchema.safeParse(page).success).toBe(true);
    expect(pageSchema.safeParse({ ...page, key: "careers" }).success).toBe(false);
  });

  it("needs a Vietnamese name and a valid slug for each named language", () => {
    const category = { sortOrder: 0, translations: { vi: { name: "Ẩm thực", slug: "am-thuc" }, en: { name: "", slug: "" } } };
    expect(categorySchema.safeParse(category).success).toBe(true);
    expect(issues(categorySchema.safeParse({ ...category, translations: { vi: { name: "", slug: "" }, en: { name: "Food", slug: "" } } }))).toEqual([
      "translations.en.slug:required",
      "translations.vi.name:required",
    ]);
  });
});
