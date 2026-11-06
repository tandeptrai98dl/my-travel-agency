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
    updateTourLinks: ok(),
    defaultCancellationPolicyId: ok("policy-default"),
    findMediaRows: ok([{ id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", path: "a.jpg", alt: { vi: "Vịnh", en: "The bay" } }]),
    countActiveDepartures: vi.fn(async () => ({ count: 1, error: null })),
    findTourSlugOwner: vi.fn(async () => ({ ownerId: null, error: null })),
    saveRedirect: ok(),
    deleteTourTranslation: ok([{ id: "tr-en" }]),
    deleteRedirectFrom: ok([]),
  };
});
const user = vi.hoisted(() => ({ current: { id: "u1", role: "editor" } }));
vi.mock("./tours.repository", () => repo);
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: vi.fn(async () => user.current) }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string | { params: { slug: string } }; locale: string }) =>
    `${locale === "vi" ? "" : "/en"}/tours${typeof href === "string" ? "" : `/${href.params.slug}`}`,
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
  tour_media: [],
  tour_destinations: [],
  tour_travel_styles: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  user.current = { id: "u1", role: "editor" };
  repo.findTour.mockResolvedValue({ data: stored(), error: null });
  repo.countActiveDepartures.mockResolvedValue({ count: 1, error: null });
  repo.findMediaRows.mockResolvedValue({
    data: [{ id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", path: "a.jpg", alt: { vi: "Vịnh", en: "The bay" } }],
    error: null,
  });
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
    expect(updateTag).toHaveBeenCalledWith("tour:t1");
  });

  it("refuses to publish with a hero missing an alt text, before writing anything", async () => {
    repo.findMediaRows.mockResolvedValue({ data: [{ id: "h", path: "a.jpg", alt: { vi: "Vịnh" } }], error: null });
    expect(await service.saveTour(values())).toEqual({ ok: false, error: "publishNeedsHero", field: "heroMediaId" });
    expect(repo.updateTour).not.toHaveBeenCalled();
  });

  it("stores a day photo and refuses to publish it without both alt texts", async () => {
    const dayImage = "9b2c6f1e-3a4d-4c5b-8e7f-1a2b3c4d5e6f";
    const withDay = (itineraryAlt: Record<string, string>) => {
      repo.findMediaRows.mockImplementation(async (...args: unknown[]) => ({
        data: (args[0] as string[]).map((id) =>
          id === dayImage
            ? { id, path: "d.jpg", alt: itineraryAlt }
            : { id, path: "a.jpg", alt: { vi: "Vịnh", en: "The bay" } },
        ),
        error: null,
      }));
      return values({
        translations: {
          vi: translation({ itinerary: [{ title: "Ngày 1", description: "", meals: [], accommodation: "", mediaId: dayImage }] }),
          en: translation({ title: "", slug: "", summary: "", seoDescription: "", isPublished: false }),
        },
      });
    };
    expect(await service.saveTour(withDay({ vi: "Hang" }))).toEqual({
      ok: false,
      error: "dayImageAlt",
      field: "translations.vi.itinerary.0.mediaId",
    });
    expect(repo.updateTour).not.toHaveBeenCalled();

    expect(await service.saveTour(withDay({ vi: "Hang", en: "Cave" }))).toEqual({ ok: true, id: "t1" });
    const saved = repo.upsertTourTranslation.mock.calls[0][0] as { itinerary: { media_ids: string[] }[] };
    expect(saved.itinerary[0].media_ids).toEqual([dayImage]);
  });

  it("refuses to drop a saved language by clearing its title", async () => {
    repo.findTour.mockResolvedValue({
      data: stored({ tour_translations: [{ locale: "en", slug: "cruise", is_published: false }] }),
      error: null,
    });
    expect(await service.saveTour(values())).toEqual({ ok: false, error: "keepLanguage", field: "translations.en.title" });
    expect(repo.upsertTourTranslation).not.toHaveBeenCalled();
  });

  it("keeps an archived tour archived when publishing fails at the end", async () => {
    repo.findTour.mockResolvedValue({ data: stored({ status: "archived" }), error: null });
    repo.updateTour
      .mockResolvedValueOnce({ data: { id: "t1" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "23514", message: "a published tour needs a hero image with Vietnamese and English alt text" } });
    expect(await service.saveTour(values())).toMatchObject({ ok: false, error: "publishNeedsHero" });
    expect(repo.updateTour.mock.calls[0][1]).toMatchObject({ status: "archived" });
  });

  it("writes all links in one call with the edited lists (set_tour_links diffs in the database)", async () => {
    repo.findTour.mockResolvedValue({
      data: stored({ tour_media: [{ media_id: "m1", sort_order: 0 }], tour_destinations: [], tour_travel_styles: [] }),
      error: null,
    });
    await service.saveTour(values());
    expect(repo.updateTourLinks).toHaveBeenCalledTimes(1);
    expect(repo.updateTourLinks.mock.calls[0][1]).toMatchObject({ media: [] });
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

describe("createTour", () => {
  it("gives a new tour the default cancellation policy (also for admins)", async () => {
    user.current = { id: "u2", role: "admin" };
    await service.createTour({ code: "VN-NEW-01", type: "group", scope: "domestic", title: "Tour mới", durationDays: 2, durationNights: 1 });
    expect(repo.insertTour.mock.calls[0][0]).toMatchObject({ cancellation_policy_id: "policy-default" });
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
    expect(repo.updateTourLinks.mock.calls[0][1]).toMatchObject({ media: ["m1", "m2"] });
  });
});

describe("removeTourLanguage", () => {
  const row = (locale: "vi" | "en", is_published: boolean) => ({ locale, slug: `slug-${locale}`, is_published });
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

  it("refuses removing the only language", async () => {
    repo.findTour.mockResolvedValueOnce({ data: stored({ tour_translations: [row("vi", false)] }), error: null });
    expect(await service.removeTourLanguage({ id, locale: "vi" })).toEqual({ ok: false, error: "onlyLanguage" });
    expect(repo.deleteTourTranslation).not.toHaveBeenCalled();
  });

  it("refuses removing the last published language of a published tour", async () => {
    repo.findTour.mockResolvedValueOnce({
      data: stored({ status: "published", tour_translations: [row("vi", true), row("en", false)] }),
      error: null,
    });
    expect(await service.removeTourLanguage({ id, locale: "vi" })).toEqual({ ok: false, error: "lastTranslation" });
  });

  it("removes a published language with a 301 to the other published language", async () => {
    repo.findTour.mockResolvedValueOnce({
      data: stored({ status: "published", tour_translations: [row("vi", true), row("en", true)] }),
      error: null,
    });
    expect(await service.removeTourLanguage({ id, locale: "en" })).toEqual({ ok: true, id: "t1" });
    expect(repo.deleteTourTranslation).toHaveBeenCalledWith("t1", "en");
    expect(repo.saveRedirect).toHaveBeenCalledWith("/en/tours/slug-en", "/tours/slug-vi");
    expect(updateTag).toHaveBeenCalledWith("tour:t1");
  });

  it("sends a published language to its tour list when the other is unpublished, and a draft gets no 301", async () => {
    repo.findTour.mockResolvedValueOnce({ data: stored({ tour_translations: [row("vi", false), row("en", true)] }), error: null });
    await service.removeTourLanguage({ id, locale: "en" });
    expect(repo.saveRedirect).toHaveBeenCalledWith("/en/tours/slug-en", "/en/tours");
    vi.mocked(repo.saveRedirect).mockClear();
    repo.findTour.mockResolvedValueOnce({ data: stored({ tour_translations: [row("vi", true), row("en", false)] }), error: null });
    await service.removeTourLanguage({ id, locale: "en" });
    expect(repo.saveRedirect).not.toHaveBeenCalled();
  });
});

describe("published paths are not shadowed by old redirects", () => {
  it("drops a redirect away from the path a published language serves", async () => {
    repo.findTour.mockResolvedValue({ data: stored(), error: null });
    await service.saveTour(values());
    expect(repo.deleteRedirectFrom).toHaveBeenCalledWith("/tours/du-thuyen");
    // The unpublished English language serves nothing, so its path is left alone.
    expect(repo.deleteRedirectFrom).toHaveBeenCalledTimes(1);
  });
});
