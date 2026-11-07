import { beforeEach, describe, expect, it, vi } from "vitest";

// The service with data access, auth and Next.js replaced: the business rules run for real.
const repo = vi.hoisted(() => {
  type Result = { data: unknown; error: { code?: string; message?: string } | null };
  const ok = (data: unknown = null) => vi.fn<(...args: unknown[]) => Promise<Result>>(async () => ({ data, error: null }));
  return {
    findDestination: ok(),
    insertDestination: ok({ id: "d-new" }),
    updateDestination: ok({ id: "d1" }),
    upsertDestinationTranslation: ok(),
    deleteDestinationTranslation: ok(),
    deleteDestinationRow: ok(),
    countDestinationUses: vi.fn(async () => ({ children: 0, tours: 0, error: null })),
    findTravelStyle: ok(),
    findMediaSummary: ok(),
    findMediaRows: ok([]),
    saveRedirect: ok(),
    deleteRedirectFrom: ok([]),
    findCancellationPolicy: ok(),
    insertCancellationPolicy: ok({ id: "p-new" }),
    updateCancellationPolicy: ok({ id: "p1" }),
    setDefaultCancellationPolicy: ok(),
    deleteCancellationPolicyRow: ok(),
  };
});
vi.mock("./taxonomy.repository", () => repo);
vi.mock("@/lib/auth/require-role", () => ({ requirePermission: vi.fn(async () => ({ id: "u1", role: "editor" })) }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: { params: { slug: string } }; locale: string }) =>
    `${locale === "vi" ? "" : "/en"}/diem-den/${href.params.slug}`,
}));
vi.mock("@/modules/media/media.service", () => ({ getMediaUrl: (path: string) => `https://cdn.test/${path}` }));
vi.mock("../destinations.service", () => ({ DESTINATIONS_TAG: "destinations" }));

const { updateTag } = await import("next/cache");
const service = await import("./taxonomy.service");

const translation = (over: Partial<Record<string, unknown>> = {}) => ({
  slug: "vinh-ha-long",
  name: "Vịnh Hạ Long",
  summary: "Đá vôi và nước xanh ngọc.",
  bestTimeToVisit: null,
  seoTitle: null,
  seoDescription: null,
  isPublished: true,
  ...over,
});
const destination = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    key: "ha-long-bay",
    type: "region",
    parentId: "c0000000-0000-4000-8000-000000000001",
    status: "published",
    heroMediaId: null,
    latitude: null,
    longitude: null,
    sortOrder: 0,
    translations: { vi: translation(), en: translation({ name: "", slug: "", isPublished: false }) },
    ...over,
  }) as Parameters<typeof service.saveDestination>[0];

beforeEach(() => vi.clearAllMocks());

describe("saveDestination", () => {
  it("creates the row and its translations, removes empty languages and refreshes the public tree", async () => {
    expect(await service.saveDestination(destination())).toEqual({ ok: true, id: "d-new" });
    expect(repo.upsertDestinationTranslation).toHaveBeenCalledWith(expect.objectContaining({ locale: "vi", slug: "vinh-ha-long" }));
    expect(repo.deleteDestinationTranslation).toHaveBeenCalledWith("d-new", "en");
    expect(updateTag).toHaveBeenCalledWith("destinations");
  });

  it("stores the rich description, or nothing when the editor is empty", async () => {
    const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hang Sửng Sốt." }] }] };
    await service.saveDestination(destination({ translations: { vi: translation({ content }), en: translation({ name: "", slug: "", isPublished: false }) } }));
    expect(repo.upsertDestinationTranslation).toHaveBeenCalledWith(expect.objectContaining({ locale: "vi", content }));
    vi.clearAllMocks();
    await service.saveDestination(
      destination({ translations: { vi: translation({ content: { type: "doc", content: [{ type: "paragraph" }] } }), en: translation({ name: "", slug: "", isPublished: false }) } }),
    );
    expect(repo.upsertDestinationTranslation).toHaveBeenCalledWith(expect.objectContaining({ locale: "vi", content: null }));
  });

  it("refuses to publish a description whose image lacks an alt text", async () => {
    const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    repo.findMediaRows.mockResolvedValueOnce({ data: [{ id, path: "a.jpg", alt: { vi: "Hang" } }], error: null });
    const content = { type: "doc", content: [{ type: "image", attrs: { mediaId: id } }] };
    expect(
      await service.saveDestination(destination({ translations: { vi: translation({ content }), en: translation({ name: "", slug: "", isPublished: false }) } })),
    ).toEqual({ ok: false, error: "contentImageAlt", field: "translations.vi.content" });
    expect(repo.insertDestination).not.toHaveBeenCalled();
  });

  it("never keeps a parent on a country", async () => {
    await service.saveDestination(destination({ type: "country" }));
    expect(repo.insertDestination).toHaveBeenCalledWith(expect.objectContaining({ parent_id: null }));
  });

  it("keeps the key fixed once published (filter URLs, ADR-016)", async () => {
    repo.findDestination.mockResolvedValueOnce({
      data: { id: "d1", key: "ha-long", status: "published", destination_translations: [] },
      error: null,
    });
    expect(await service.saveDestination(destination({ id: "d1" }))).toEqual({
      ok: false,
      error: "key_locked",
      field: "key",
    });
    expect(repo.updateDestination).not.toHaveBeenCalled();
  });

  it("refuses to publish with a hero image that lacks VI/EN alt text", async () => {
    repo.findMediaSummary.mockResolvedValueOnce({
      data: { id: "m1", path: "2026/11/x.jpg", alt: { vi: "Vịnh" }, blur_data_url: null },
      error: null,
    });
    const result = await service.saveDestination(destination({ heroMediaId: "m0000000-0000-4000-8000-000000000001" }));
    expect(result).toEqual({ ok: false, error: "hero_alt_missing", field: "heroMediaId" });
  });

  it("maps a taken slug to its field and removes the half-created destination", async () => {
    repo.upsertDestinationTranslation.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "destination_translations_locale_slug_key"' },
    });
    expect(await service.saveDestination(destination())).toEqual({
      ok: false,
      error: "slug_taken",
      field: "translations.vi.slug",
    });
    expect(repo.deleteDestinationRow).toHaveBeenCalledWith("d-new");
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("adds a 301 when a published slug changes", async () => {
    repo.findDestination.mockResolvedValueOnce({
      data: {
        id: "d1",
        key: "ha-long-bay",
        status: "published",
        destination_translations: [{ locale: "vi", slug: "ha-long", is_published: true }],
      },
      error: null,
    });
    await service.saveDestination(destination({ id: "d1" }));
    expect(repo.saveRedirect).toHaveBeenCalledWith("/diem-den/ha-long", "/diem-den/vinh-ha-long");
  });

  it("publishing a language removes a redirect from its path; a draft language keeps it (decision 14)", async () => {
    await service.saveDestination(destination());
    expect(repo.deleteRedirectFrom.mock.calls).toEqual([["/diem-den/vinh-ha-long"]]);
    repo.deleteRedirectFrom.mockClear();
    await service.saveDestination(destination({ status: "draft", translations: { vi: translation({ isPublished: false }), en: translation({ name: "", slug: "", isPublished: false }) } }));
    expect(repo.deleteRedirectFrom).not.toHaveBeenCalled();
  });
});

describe("saveDestination after a partial failure", () => {
  it("keeps the redirect of a language saved before another language failed, and refreshes the tree", async () => {
    repo.findDestination.mockResolvedValueOnce({
      data: {
        id: "d1",
        key: "ha-long-bay",
        status: "published",
        destination_translations: [{ locale: "vi", slug: "ha-long", is_published: true }],
      },
      error: null,
    });
    repo.upsertDestinationTranslation
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "destination_translations_locale_slug_key" } });
    const result = await service.saveDestination(
      destination({ id: "d1", translations: { vi: translation(), en: translation({ slug: "taken", name: "Ha Long" }) } }),
    );
    expect(result).toEqual({ ok: false, error: "slug_taken", field: "translations.en.slug" });
    expect(repo.saveRedirect).toHaveBeenCalledWith("/diem-den/ha-long", "/diem-den/vinh-ha-long");
    expect(updateTag).toHaveBeenCalledWith("destinations");
    expect(repo.deleteDestinationRow).not.toHaveBeenCalled();
  });

  it("points a database publish refusal at the body field of that kind", async () => {
    repo.upsertDestinationTranslation.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", message: "a published translation needs a name and a summary" },
    });
    expect(await service.saveDestination(destination())).toEqual({
      ok: false,
      error: "requiredToPublish",
      field: "translations.vi.summary",
    });
  });
});

describe("deleteDestination", () => {
  it("refuses while children or tours use it", async () => {
    repo.countDestinationUses.mockResolvedValueOnce({ children: 1, tours: 0, error: null });
    expect(await service.deleteDestination("d1")).toEqual({ ok: false, error: "in_use" });
    expect(repo.deleteDestinationRow).not.toHaveBeenCalled();
  });
});

describe("saveCancellationPolicy", () => {
  const policy = {
    name: "Tiêu chuẩn",
    rules: [
      { minDaysBefore: 30, refundPercent: 80 },
      { minDaysBefore: 0, refundPercent: 0 },
    ],
    summary: { vi: "Hoàn 80% nếu huỷ trước 30 ngày.", en: "80% refund up to 30 days before." },
    isDefault: true,
  };

  it("saves the policy, then moves the default flag in one database call", async () => {
    expect(await service.saveCancellationPolicy(policy)).toEqual({ ok: true, id: "p-new" });
    expect(repo.insertCancellationPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ is_default: false, rules: [{ min_days_before: 30, refund_percent: 80 }, { min_days_before: 0, refund_percent: 0 }] }),
    );
    expect(repo.setDefaultCancellationPolicy).toHaveBeenCalledWith("p-new");
    expect(repo.setDefaultCancellationPolicy.mock.invocationCallOrder[0]).toBeGreaterThan(
      repo.insertCancellationPolicy.mock.invocationCallOrder[0],
    );
  });

  it("never switches the default off: another policy has to become the default", async () => {
    repo.findCancellationPolicy.mockResolvedValueOnce({ data: { id: "p1", version: 2, is_default: true }, error: null });
    expect(await service.saveCancellationPolicy({ ...policy, id: "p1", isDefault: false })).toEqual({
      ok: false,
      error: "default_required",
      field: "isDefault",
    });
    expect(repo.updateCancellationPolicy).not.toHaveBeenCalled();
  });

  it("does not delete the default policy", async () => {
    repo.findCancellationPolicy.mockResolvedValueOnce({ data: { id: "p1", is_default: true }, error: null });
    expect(await service.deleteCancellationPolicy("p1")).toEqual({ ok: false, error: "is_default" });
    expect(repo.deleteCancellationPolicyRow).not.toHaveBeenCalled();
  });

  it("raises the version on every edit (bookings keep their own snapshot)", async () => {
    repo.findCancellationPolicy.mockResolvedValueOnce({ data: { id: "p1", version: 3, is_default: true }, error: null });
    await service.saveCancellationPolicy({ ...policy, id: "p1" });
    expect(repo.updateCancellationPolicy).toHaveBeenCalledWith("p1", expect.objectContaining({ version: 4, is_default: true }));
    expect(repo.setDefaultCancellationPolicy).not.toHaveBeenCalled();
  });

  it("refuses to delete a policy that tours use", async () => {
    repo.findCancellationPolicy.mockResolvedValueOnce({ data: { id: "p1", is_default: false }, error: null });
    repo.deleteCancellationPolicyRow.mockResolvedValueOnce({ data: null, error: { code: "23503" } });
    expect(await service.deleteCancellationPolicy("p1")).toEqual({ ok: false, error: "in_use" });
  });
});
