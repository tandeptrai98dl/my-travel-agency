import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
const repo = vi.hoisted(() => {
  const ok = (data: unknown = null) => vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data, error: null }));
  return {
    findTour: ok(),
    updateTour: ok({ id: "t1" }),
    insertTour: ok({ id: "t-new" }),
    deleteTourRow: ok(),
    upsertTourTranslation: ok(),
    deleteTourTranslation: ok(),
    replaceTourLinks: ok(),
    countActiveDepartures: vi.fn(async () => ({ count: 1, error: null })),
    findTourSlugOwner: vi.fn(async () => ({ ownerId: null, error: null })),
    saveRedirect: ok(),
  };
});
const user = vi.hoisted(() => ({ current: { id: "u1", role: "editor" } }));
vi.mock("./tours.repository", () => repo);
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: vi.fn(async () => user.current) }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: { params: { slug: string } }; locale: string }) =>
    `${locale === "vi" ? "" : "/en"}/tours/${href.params.slug}`,
}));
vi.mock("@/modules/media/media.service", () => ({ getMediaUrl: (path: string) => `https://cdn.test/${path}` }));

const { updateTag } = await import("next/cache");
const service = await import("./tours.service");
const { tourSchema } = await import("./tours.schemas");

const translation = (overrides: Record<string, unknown> = {}) => ({
  slug: "du-thuyen",
  title: "Du thuyền",
  subtitle: "",
  summary: "Hai đêm.",
  highlights: [],
  itinerary: [],
  inclusions: [],
  exclusions: [],
  practicalInfo: "",
  faqs: [],
  seoTitle: "",
  seoDescription: "Mô tả.",
  ogMediaId: null,
  isPublished: true,
  ...overrides,
});
const values = (overrides: Record<string, unknown> = {}) =>
  tourSchema.parse({
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    code: "VN-HLB-03",
    type: "group",
    scope: "domestic",
    status: "published",
    durationDays: 3,
    durationNights: 2,
    minPax: 1,
    maxPax: null,
    minPaxToOperate: null,
    childAgeMax: 11,
    infantAgeMax: 1,
    isFeatured: false,
    heroMediaId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    galleryIds: [],
    destinationIds: [],
    travelStyleIds: [],
    prices: { fromPrice: 99, depositPercent: 10, balanceDueDays: 5, cancellationPolicyId: null },
    translations: { vi: translation(), en: translation({ title: "", slug: "", summary: "", seoDescription: "", isPublished: false }) },
    ...overrides,
  });
const stored = (overrides: Record<string, unknown> = {}) => ({
  id: "t1",
  status: "draft",
  from_price: 0,
  hero_media_id: null,
  published_at: null,
  tour_translations: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  user.current = { id: "u1", role: "editor" };
  repo.findTour.mockResolvedValue({ data: stored(), error: null });
  repo.countActiveDepartures.mockResolvedValue({ count: 1, error: null });
});

describe("saveTour", () => {
  it("publishes in an order the database accepts: content and links first, status last", async () => {
    expect(await service.saveTour(values())).toEqual({ ok: true, id: "t1" });
    const firstUpdate = repo.updateTour.mock.calls[0][1] as Record<string, unknown>;
    expect(firstUpdate.status).toBe("draft");
    const lastUpdate = repo.updateTour.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(lastUpdate).toMatchObject({ status: "published" });
    expect(lastUpdate.published_at).toEqual(expect.any(String));
    expect(repo.upsertTourTranslation.mock.invocationCallOrder[0]).toBeLessThan(repo.updateTour.mock.invocationCallOrder.at(-1)!);
    expect(updateTag).toHaveBeenCalledWith("tours");
  });

  it("never sends price columns for a non-admin (the price guard would refuse)", async () => {
    await service.saveTour(values());
    for (const [, row] of repo.updateTour.mock.calls) expect(row).not.toHaveProperty("from_price");
  });

  it("sends prices for an admin", async () => {
    user.current = { id: "u2", role: "admin" };
    await service.saveTour(values());
    expect(repo.updateTour.mock.calls[0][1]).toMatchObject({ from_price: 99, deposit_percent: 10, balance_due_days: 5 });
  });

  it("refuses to publish a group tour without departures, before writing anything", async () => {
    repo.countActiveDepartures.mockResolvedValue({ count: 0, error: null });
    expect(await service.saveTour(values())).toEqual({ ok: false, error: "publishNeedsDeparture", field: "status" });
    expect(repo.updateTour).not.toHaveBeenCalled();
  });

  it("refuses to publish a private tour without a price", async () => {
    expect(await service.saveTour(values({ type: "private" }))).toMatchObject({ ok: false, error: "publishNeedsPrice" });
  });

  it("unpublishing sets the status first", async () => {
    repo.findTour.mockResolvedValue({ data: stored({ status: "published", hero_media_id: "h" }), error: null });
    await service.saveTour(values({ status: "draft" }));
    expect(repo.updateTour.mock.calls[0][1]).toMatchObject({ status: "draft" });
    expect(repo.updateTour.mock.invocationCallOrder[0]).toBeLessThan(repo.upsertTourTranslation.mock.invocationCallOrder[0]);
  });

  it("adds a 301 when a published slug changes, and maps a taken slug to its field", async () => {
    repo.findTour.mockResolvedValue({
      data: stored({ tour_translations: [{ locale: "vi", slug: "cu", is_published: true }] }),
      error: null,
    });
    await service.saveTour(values());
    expect(repo.saveRedirect).toHaveBeenCalledWith("/tours/cu", "/tours/du-thuyen");

    repo.upsertTourTranslation.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "tour_translations_locale_slug_key" },
    });
    expect(await service.saveTour(values())).toEqual({ ok: false, error: "slug_taken", field: "translations.vi.slug" });
  });
});

describe("mapTourError", () => {
  it("maps the database publish and price rules to fields", () => {
    expect(service.mapTourError({ code: "23514", message: "a published tour needs a hero image with Vietnamese and English alt text" }))
      .toEqual({ ok: false, error: "publishNeedsHero", field: "heroMediaId" });
    expect(service.mapTourError({ code: "42501", message: "only an admin sets tour prices and terms" })).toEqual({
      ok: false,
      error: "adminOnly",
      field: "prices",
    });
    expect(service.mapTourError({ code: "23514", message: "unpublish the tour before its last published translation" }, "en"))
      .toEqual({ ok: false, error: "lastTranslation", field: "translations.en.isPublished" });
    expect(service.mapTourError({ code: "23505", message: 'duplicate key value violates unique constraint "tours_code_key"' }))
      .toEqual({ ok: false, error: "code_taken", field: "code" });
  });
});

describe("duplicateTour", () => {
  it("copies content as an unpublished draft with free slugs, and no departures", async () => {
    repo.findTour.mockResolvedValue({
      data: stored({
        status: "published",
        type: "group",
        from_price: 12_000_000,
        tour_translations: [{ locale: "vi", slug: "du-thuyen", title: "Du thuyền", is_published: true }],
        tour_media: [{ media_id: "m2", sort_order: 1 }, { media_id: "m1", sort_order: 0 }],
        tour_destinations: [],
        tour_travel_styles: [],
      }),
      error: null,
    });
    expect(await service.duplicateTour({ id: "t1", code: "VN-HLB-03-B" })).toEqual({ ok: true, id: "t-new" });
    expect(repo.insertTour.mock.calls[0][0]).toMatchObject({ status: "draft", code: "VN-HLB-03-B", from_price: 0 });
    expect(repo.upsertTourTranslation.mock.calls[0][0]).toMatchObject({ slug: "du-thuyen-ban-sao", is_published: false });
    expect(repo.replaceTourLinks.mock.calls[0][1]).toMatchObject({ media: ["m1", "m2"] });
  });
});
