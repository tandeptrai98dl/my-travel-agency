import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/public", () => ({
  publicEnv: { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS: false },
}));

import {
  buildCards,
  countryOf,
  readFaqs,
  readItinerary,
  readPolicy,
  readPriceTiers,
  readStrings,
  toImage,
  withDescendants,
} from "./tour-public.mapping";

const media = {
  id: "m1",
  path: "2026/01/m1.jpg",
  width: 3000,
  height: 2000,
  alt: { vi: "Vịnh đá vôi", en: "Limestone bay" },
  blur_data_url: "data:image/webp;base64,AAAA",
};

describe("toImage", () => {
  it("maps a media row with the alt text of the language", () => {
    expect(toImage(media, "en")).toEqual({
      src: "https://proj.supabase.co/storage/v1/object/public/media/2026/01/m1.jpg",
      width: 3000,
      height: 2000,
      alt: "Limestone bay",
      blurDataUrl: "data:image/webp;base64,AAAA",
    });
  });

  it("falls back for missing sizes, alt text and unsafe placeholders", () => {
    const image = toImage({ ...media, width: null, height: null, alt: { vi: "Vịnh" }, blur_data_url: "javascript:x" }, "en");
    expect(image).toMatchObject({ width: 2400, height: 1600, alt: "Vịnh", blurDataUrl: null });
    expect(toImage(null, "vi")).toBeNull();
  });
});

describe("JSON readers", () => {
  it("keeps only non-empty strings", () => {
    expect(readStrings([" A ", "", 3, null, "B"])).toEqual(["A", "B"]);
    expect(readStrings("nope")).toEqual([]);
  });

  it("reads itinerary days in order, numbering them and keeping known meals", () => {
    expect(
      readItinerary([
        { day: 9, title: "Hà Nội", description: "Đón sân bay.", meals: ["dinner", "snack", "breakfast"], accommodation: " Khách sạn ", media_ids: ["m1", "m2"] },
        { title: "" },
        "junk",
        { title: "Sa Pa", meals: "lunch", accommodation: "" },
      ]),
    ).toEqual([
      { day: 1, title: "Hà Nội", description: "Đón sân bay.", meals: ["breakfast", "dinner"], accommodation: "Khách sạn", mediaId: "m1" },
      { day: 2, title: "Sa Pa", description: "", meals: [], accommodation: null, mediaId: null },
    ]);
  });

  it("reads FAQs with both parts only", () => {
    expect(readFaqs([{ question: "Q", answer: "A" }, { question: "Q2" }, null])).toEqual([{ question: "Q", answer: "A" }]);
  });

  it("reads the policy summary of the language and its numeric rules", () => {
    expect(
      readPolicy(
        { summary: { vi: "Hủy trước 30 ngày", en: "" }, rules: [{ min_days_before: 30, refund_percent: 80 }, { min_days_before: "x" }] },
        "en",
      ),
    ).toEqual({ summary: null, rules: [{ minDaysBefore: 30, refundPercent: 80 }] });
    expect(readPolicy(null, "vi")).toBeNull();
  });

  it("keeps price tiers valid today, sorted by group size", () => {
    expect(
      readPriceTiers(
        [
          { min_pax: 4, max_pax: 6, price_per_adult: 20, valid_from: null, valid_to: null },
          { min_pax: 2, max_pax: 3, price_per_adult: 25, valid_from: "2026-01-01", valid_to: "2026-12-31" },
          { min_pax: 7, max_pax: 9, price_per_adult: 18, valid_from: "2027-01-01", valid_to: null },
        ],
        "2026-11-07",
      ),
    ).toEqual([
      { minPax: 2, maxPax: 3, pricePerAdult: 25 },
      { minPax: 4, maxPax: 6, pricePerAdult: 20 },
    ]);
  });
});

describe("buildCards", () => {
  it("keeps the search order and drops tours without a row in this language", () => {
    const cards = buildCards(
      [
        { tour_id: "b", display_price: 18900000, price_source: "from_price", next_departure_date: null, other_departure_count: 0, seats_left_next: null },
        { tour_id: "gone", display_price: 1, price_source: "departure", next_departure_date: "2026-11-21", other_departure_count: 0, seats_left_next: 3 },
        { tour_id: "a", display_price: 12900000, price_source: "departure", next_departure_date: "2026-11-21", other_departure_count: 11, seats_left_next: 16 },
      ],
      [
        { id: "a", type: "group", duration_days: 3, duration_nights: 2, hero: media, tour_translations: [{ slug: "du-thuyen", title: "Du thuyền" }], tour_destinations: [{ destination_id: "d1" }, { destination_id: "hidden" }] },
        { id: "b", type: "private", duration_days: 5, duration_nights: 4, hero: null, tour_translations: [{ slug: "hoi-an", title: "Hội An" }], tour_destinations: [] },
      ],
      (id) => (id === "d1" ? { key: "ha-long-bay", name: "Vịnh Hạ Long" } : null),
      "vi",
    );
    expect(cards.map((card) => card.id)).toEqual(["b", "a"]);
    expect(cards[1]).toMatchObject({
      slug: "du-thuyen",
      priceSource: "departure",
      nextDepartureDate: "2026-11-21",
      otherDepartureCount: 11,
      destinations: [{ key: "ha-long-bay", name: "Vịnh Hạ Long" }],
    });
    expect(cards[0]).toMatchObject({ type: "private", image: null, priceSource: "from_price" });
  });
});

describe("destination tree helpers", () => {
  const all = [
    { id: "vn", key: "vietnam", parent_id: null },
    { id: "north", key: "northern-vietnam", parent_id: "vn" },
    { id: "hlb", key: "ha-long-bay", parent_id: "north" },
    { id: "jp", key: "japan", parent_id: null },
  ];

  it("expands a country to everything below it", () => {
    expect(withDescendants(["vn"], all).sort()).toEqual(["hlb", "north", "vn"]);
  });

  it("finds the country of a city", () => {
    expect(countryOf("hlb", all)).toBe("vn");
    expect(countryOf("jp", all)).toBe("jp");
    expect(countryOf("unknown", all)).toBe("unknown");
  });
});
