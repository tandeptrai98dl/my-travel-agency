import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  findDestinationBySlug: vi.fn(),
  findDestinationBySlugInOtherLocale: vi.fn(),
  findDestinationSlugs: vi.fn(),
  findDestinationRows: vi.fn(),
  findTourDestinationLinks: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/env/public", () => ({
  publicEnv: { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS: false },
}));
vi.mock("./destination-public.repository", () => repo);
vi.mock("./tour-public.repository", () => ({ findMediaByIds: vi.fn() }));
vi.mock("./tour-public.service", () => ({ getTourCards: vi.fn(async () => []) }));

import { getDestinationPage } from "./destination-public.service";

const row = (id: string, parent: string | null, locale: string, slug: string, name: string) => ({
  id,
  key: id,
  type: parent ? "city" : "country",
  parent_id: parent,
  sort_order: 1,
  hero: null,
  destination_translations: [{ slug, name, summary: null, best_time_to_visit: null, locale }],
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.findDestinationBySlug.mockResolvedValue({
    data: {
      destination_id: "hanoi",
      slug: "ha-noi",
      name: "Hà Nội",
      summary: null,
      content: null,
      best_time_to_visit: null,
      seo_title: null,
      seo_description: null,
      destinations: { id: "hanoi", key: "hanoi", type: "city", parent_id: "vietnam", status: "published", hero: null },
    },
    error: null,
  });
  repo.findDestinationSlugs.mockResolvedValue({ data: [{ locale: "vi", slug: "ha-noi" }, { locale: "en", slug: "hanoi" }], error: null });
  repo.findTourDestinationLinks.mockResolvedValue({ data: [], error: null });
});

describe("getDestinationPage alternates", () => {
  it("offers the other language only where the destination is reachable in its tree", async () => {
    // Vietnamese: Việt Nam → Hà Nội. English: the parent country is not translated, so Hanoi is hidden.
    repo.findDestinationRows.mockImplementation(async (locale: string) => ({
      data: locale === "vi" ? [row("vietnam", null, "vi", "viet-nam", "Việt Nam"), row("hanoi", "vietnam", "vi", "ha-noi", "Hà Nội")] : [row("hanoi", "vietnam", "en", "hanoi", "Hanoi")],
      error: null,
    }));
    const result = await getDestinationPage("vi", "ha-noi");
    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;
    expect(result.page.alternates.vi).toEqual({ href: "/diem-den/ha-noi", available: true });
    expect(result.page.alternates.en).toEqual({ href: "/en/destinations", available: false });
  });

  it("offers both languages when both trees reach it", async () => {
    repo.findDestinationRows.mockImplementation(async (locale: string) => ({
      data:
        locale === "vi"
          ? [row("vietnam", null, "vi", "viet-nam", "Việt Nam"), row("hanoi", "vietnam", "vi", "ha-noi", "Hà Nội")]
          : [row("vietnam", null, "en", "vietnam", "Vietnam"), row("hanoi", "vietnam", "en", "hanoi", "Hanoi")],
      error: null,
    }));
    const result = await getDestinationPage("vi", "ha-noi");
    if (result.kind !== "found") throw new Error("expected a page");
    expect(result.page.alternates.en).toEqual({ href: "/en/destinations/hanoi", available: true });
    expect(result.page.ancestors).toEqual([{ name: "Việt Nam", slug: "viet-nam" }]);
  });
});
