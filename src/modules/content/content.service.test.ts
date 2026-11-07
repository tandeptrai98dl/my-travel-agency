import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
const repo = vi.hoisted(() => {
  const ok = (data: unknown = null) => vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data, error: null }));
  return {
    findPost: ok(),
    insertPost: ok({ id: "p-new" }),
    updatePost: ok({ id: "p1" }),
    deletePostRow: ok([{ id: "p1" }]),
    upsertPostTranslation: ok(),
    findMediaRows: ok([]),
    saveRedirect: ok(),
    deleteRedirectFrom: ok([]),
    findPageByKey: ok(),
    insertPage: ok({ id: "page-new" }),
    updatePage: ok({ id: "page1" }),
    upsertPageTranslation: ok(),
    findCategory: ok(),
    insertCategory: ok({ id: "c-new" }),
    updateCategory: ok({ id: "c1" }),
    upsertCategoryTranslation: ok(),
    deleteCategoryTranslation: ok(),
    deleteCategoryRow: ok([{ id: "c1" }]),
    countCategoryPosts: vi.fn(async () => ({ count: 0, error: null })),
  };
});
vi.mock("./content.repository", () => repo);
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: vi.fn(async () => ({ id: "u1", role: "editor" })) }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: { pathname: string; params: { slug: string } }; locale: string }) =>
    `${locale === "vi" ? "" : "/en"}${href.pathname.replace("[slug]", href.params.slug)}`,
}));
vi.mock("@/modules/media/media.service", () => ({ getMediaUrl: (path: string) => `https://cdn.test/${path}` }));

const { updateTag } = await import("next/cache");
const service = await import("./content.service");
const { pageSchema, postSchema } = await import("./content.schemas");

const COVER = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const INLINE = "0f8fad5b-d9cb-469f-a165-70867728950e";
const described = (id: string) => ({ id, path: `${id}.jpg`, alt: { vi: "Ảnh", en: "Photo" } });
const body = (image?: string) => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Hội An." }] },
    ...(image ? [{ type: "image", attrs: { mediaId: image } }] : []),
  ],
});
const empty = { slug: "", title: "", excerpt: "", content: { type: "doc", content: [] }, seoTitle: "", seoDescription: "", isPublished: false };
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
const post = (overrides: Record<string, unknown> = {}) =>
  postSchema.parse({
    id: "0c1a5b7e-9d3f-4a2b-8c6d-1e2f3a4b5c6d",
    status: "published",
    categoryId: null,
    coverMediaId: COVER,
    translations: { vi: translation(), en: empty },
    ...overrides,
  });
const storedPost = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  status: "draft",
  category_id: null,
  cover_media_id: null,
  published_at: null,
  post_translations: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.findPost.mockResolvedValue({ data: storedPost(), error: null });
  repo.findMediaRows.mockImplementation(async (...args: unknown[]) => ({
    data: (args[0] as string[]).map(described),
    error: null,
  }));
  repo.findPageByKey.mockResolvedValue({ data: null, error: null });
});

describe("savePost", () => {
  it("publishes in an order the database accepts: content first, status last", async () => {
    expect(await service.savePost(post())).toEqual({ ok: true, id: "p1" });
    expect(repo.updatePost.mock.calls[0][1]).toMatchObject({ status: "draft", cover_media_id: COVER });
    expect(repo.updatePost.mock.calls.at(-1)?.[1]).toMatchObject({ status: "published", published_at: expect.any(String) });
    expect(repo.upsertPostTranslation.mock.invocationCallOrder[0]).toBeLessThan(repo.updatePost.mock.invocationCallOrder.at(-1)!);
    expect(updateTag).toHaveBeenCalledWith("posts");
    expect(updateTag).toHaveBeenCalledWith("post:p1");
  });

  it("unpublishes first, then saves the languages", async () => {
    repo.findPost.mockResolvedValue({ data: storedPost({ status: "published", published_at: "2026-11-01" }), error: null });
    await service.savePost(post({ status: "draft" }));
    expect(repo.updatePost).toHaveBeenCalledTimes(1);
    expect(repo.updatePost.mock.calls[0][1]).toMatchObject({ status: "draft" });
  });

  it("creates a new article as a draft with its author and removes it if a language fails", async () => {
    repo.upsertPostTranslation.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "post_translations_locale_slug_key" } });
    expect(await service.savePost(post({ id: undefined }))).toEqual({ ok: false, error: "slug_taken", field: "translations.vi.slug" });
    expect(repo.insertPost.mock.calls[0][0]).toMatchObject({ status: "draft", author_id: "u1" });
    expect(repo.deletePostRow).toHaveBeenCalledWith("p-new");
  });

  it("refuses a cover or an inline image without both alt texts before writing", async () => {
    repo.findMediaRows.mockResolvedValue({ data: [{ id: COVER, path: "a.jpg", alt: { vi: "Ảnh" } }], error: null });
    expect(await service.savePost(post())).toEqual({ ok: false, error: "publishNeedsCover", field: "coverMediaId" });
    repo.findMediaRows.mockImplementation(async (...args: unknown[]) => ({
      data: (args[0] as string[]).filter((id) => id !== INLINE).map(described),
      error: null,
    }));
    expect(await service.savePost(post({ translations: { vi: translation({ content: body(INLINE) }), en: empty } }))).toEqual({
      ok: false,
      error: "contentImageAlt",
      field: "translations.vi.content",
    });
    expect(repo.updatePost).not.toHaveBeenCalled();
  });

  it("refuses to drop a saved language by clearing its title", async () => {
    repo.findPost.mockResolvedValue({ data: storedPost({ post_translations: [{ locale: "en", slug: "x", is_published: false }] }), error: null });
    expect(await service.savePost(post())).toEqual({ ok: false, error: "keepLanguage", field: "translations.en.title" });
  });

  it("adds a 301 when a published article's slug changes", async () => {
    repo.findPost.mockResolvedValue({
      data: storedPost({ post_translations: [{ locale: "vi", slug: "pho-co-cu", is_published: true }] }),
      error: null,
    });
    await service.savePost(post());
    expect(repo.saveRedirect).toHaveBeenCalledWith("/journal/pho-co-cu", "/journal/pho-co");
  });

  it("publishing a language removes a redirect from its path, as tours do (decision 14)", async () => {
    repo.findPost.mockResolvedValue({ data: storedPost(), error: null });
    repo.deleteRedirectFrom.mockResolvedValueOnce({ data: [{ id: "r1" }], error: null });
    await service.savePost(post());
    expect(repo.deleteRedirectFrom.mock.calls).toEqual([["/journal/pho-co"]]);
    // A draft language serves nothing, so its path keeps any redirect.
    repo.deleteRedirectFrom.mockClear();
    await service.savePost(post({ status: "draft", translations: { vi: translation({ isPublished: false }), en: empty } }));
    expect(repo.deleteRedirectFrom).not.toHaveBeenCalled();
  });

  it("a failed redirect removal is logged and never fails the save", async () => {
    repo.findPost.mockResolvedValue({ data: storedPost(), error: null });
    repo.deleteRedirectFrom.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await service.savePost(post())).toMatchObject({ ok: true });
  });

  it("maps the database rules back to their fields", () => {
    expect(service.mapContentError({ code: "23514", message: "a published article needs a cover image with Vietnamese and English alt text" })).toEqual({
      ok: false,
      error: "publishNeedsCover",
      field: "coverMediaId",
    });
    expect(service.mapContentError({ code: "23514", message: "unpublish the item before its last published translation" }, "en")).toEqual({
      ok: false,
      error: "lastTranslation",
      field: "translations.en.isPublished",
    });
    expect(service.mapContentError({ code: "23514", message: "images in published content need Vietnamese and English alt text" })).toMatchObject({
      error: "contentImageAlt",
    });
  });
});

describe("deletePost and categories", () => {
  it("never deletes a published article", async () => {
    repo.findPost.mockResolvedValue({ data: storedPost({ status: "published" }), error: null });
    expect(await service.deletePost("p1")).toEqual({ ok: false, error: "published" });
    expect(repo.deletePostRow).not.toHaveBeenCalled();
  });

  it("deletes a topic only when no article uses it", async () => {
    repo.countCategoryPosts.mockResolvedValueOnce({ count: 2, error: null });
    expect(await service.deleteCategory("c1")).toEqual({ ok: false, error: "in_use" });
    expect(await service.deleteCategory("c1")).toEqual({ ok: true });
  });

  it("redirects a topic's old path when its slug changes", async () => {
    repo.findCategory.mockResolvedValue({
      data: { id: "c1", sort_order: 0, post_category_translations: [{ locale: "vi", slug: "am-thuc-cu", name: "Ẩm thực" }] },
      error: null,
    });
    await service.saveCategory({
      id: "0c1a5b7e-9d3f-4a2b-8c6d-1e2f3a4b5c6d",
      sortOrder: 1,
      translations: { vi: { name: "Ẩm thực", slug: "am-thuc" }, en: { name: "", slug: "" } },
    });
    expect(repo.saveRedirect).toHaveBeenCalledWith("/journal/topics/am-thuc-cu", "/journal/topics/am-thuc");
    expect(repo.deleteRedirectFrom.mock.calls).toEqual([["/journal/topics/am-thuc"]]);
    expect(repo.deleteCategoryTranslation).toHaveBeenCalledWith("c1", "en");
  });
});

describe("savePage", () => {
  const page = (key: string) =>
    pageSchema.parse({ key, status: "published", translations: { vi: translation({ slug: "chinh-sach-moi" }), en: empty } });

  it("creates the page row for a fixed key on its first save", async () => {
    expect(await service.savePage(page("terms"))).toEqual({ ok: true, id: "page-new" });
    expect(repo.insertPage.mock.calls[0][0]).toEqual({ key: "terms", status: "draft" });
    expect(repo.updatePage.mock.calls.at(-1)).toEqual(["page-new", { status: "published" }]);
    expect(updateTag).toHaveBeenCalledWith("page:terms");
  });

  it("redirects policy pages on a slug change, not pages with a fixed route", async () => {
    const stored = (key: string) => ({
      data: { id: "page1", key, status: "published", page_translations: [{ locale: "vi", slug: "cu", is_published: true }] },
      error: null,
    });
    repo.findPageByKey.mockResolvedValueOnce(stored("terms"));
    await service.savePage(page("terms"));
    expect(repo.saveRedirect).toHaveBeenCalledWith("/policies/cu", "/policies/chinh-sach-moi");
    expect(repo.deleteRedirectFrom.mock.calls).toEqual([["/policies/chinh-sach-moi"]]);
    repo.saveRedirect.mockClear();
    repo.deleteRedirectFrom.mockClear();
    repo.findPageByKey.mockResolvedValueOnce(stored("about"));
    await service.savePage(page("about"));
    expect(repo.saveRedirect).not.toHaveBeenCalled();
    expect(repo.deleteRedirectFrom).not.toHaveBeenCalled();
  });
});
