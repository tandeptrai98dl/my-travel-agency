import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/public", () => ({
  publicEnv: { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS: false },
}));

import { faqFromRichText, ratingSummary, toJournalCards, toPublicReviews, toTopics } from "./content-public.mapping";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (...texts: string[]) => ({ type: "paragraph", content: texts.map((text) => ({ type: "text", text })) });
const h = (text: string) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] });

describe("faqFromRichText", () => {
  it("pairs each heading with the text until the next heading", () => {
    const items = faqFromRichText(
      doc(
        p("Lời giới thiệu không thuộc câu hỏi nào."),
        h("Tôi cần đặt cọc bao nhiêu?"),
        p("Đặt cọc ", "30%", " khi xác nhận."),
        p("Phần còn lại trước 30 ngày."),
        h("Câu hỏi chưa có trả lời"),
        h("Có đổi ngày được không?"),
        { type: "bulletList", content: [{ type: "listItem", content: [p("Có, nếu còn chỗ.")] }] },
      ),
    );
    expect(items).toEqual([
      { question: "Tôi cần đặt cọc bao nhiêu?", answer: "Đặt cọc 30% khi xác nhận. Phần còn lại trước 30 ngày." },
      { question: "Có đổi ngày được không?", answer: "Có, nếu còn chỗ." },
    ]);
  });

  it("returns nothing for empty or invalid content", () => {
    expect(faqFromRichText(null)).toEqual([]);
    expect(faqFromRichText({ type: "doc", content: "nope" })).toEqual([]);
  });
});

describe("journal", () => {
  const topicRows = [
    { id: "t2", sort_order: 2, post_category_translations: [{ locale: "vi", slug: "cam-hung", name: "Cảm hứng" }] },
    { id: "t1", sort_order: 1, post_category_translations: [{ locale: "vi", slug: "cam-nang", name: "Cẩm nang" }, { locale: "en", slug: "guides", name: "Guides" }] },
    { id: "t3", sort_order: 3, post_category_translations: [{ locale: "vi", slug: "trong", name: "Trống" }] },
  ];

  it("lists translated topics that have articles, in order, with counts", () => {
    expect(toTopics(topicRows, ["t2", "t1", "t2", null], "vi")).toEqual([
      { id: "t1", slug: "cam-nang", name: "Cẩm nang", count: 1 },
      { id: "t2", slug: "cam-hung", name: "Cảm hứng", count: 2 },
    ]);
    expect(toTopics(topicRows, ["t2"], "en")).toEqual([]);
  });

  it("maps article cards with their topic and a Vietnam-time date", () => {
    const topics = toTopics(topicRows, ["t1"], "vi");
    const cards = toJournalCards(
      [
        { id: "p1", published_at: "2026-11-06T18:00:00Z", category_id: "t1", cover: null, post_translations: [{ slug: "a", title: "A", excerpt: " ", locale: "vi" }] },
        { id: "p2", published_at: null, category_id: "t3", cover: null, post_translations: [{ slug: "b", title: "B", excerpt: "Tóm tắt", locale: "en" }] },
      ],
      topics,
      "vi",
    );
    expect(cards).toEqual([{ id: "p1", slug: "a", title: "A", excerpt: null, publishedAt: "2026-11-07", image: null, topic: { slug: "cam-nang", name: "Cẩm nang" } }]);
  });
});

describe("reviews", () => {
  it("maps reviews with the tour in this language and never more than five stars", () => {
    const reviews = toPublicReviews(
      [
        {
          id: "r1",
          author_name: " Lan ",
          author_country: "",
          rating: 7,
          title: null,
          content: " Tuyệt vời ",
          locale: "vi",
          travel_date: "2026-10-01",
          is_verified: false,
          tours: { id: "t", tour_translations: [{ locale: "en", slug: "ha-long-bay-cruise", title: "Ha Long Bay Cruise" }] },
        },
      ],
      "en",
    );
    expect(reviews[0]).toMatchObject({ authorName: "Lan", authorCountry: null, rating: 5, content: "Tuyệt vời", tour: { slug: "ha-long-bay-cruise" } });
    const noTour = toPublicReviews(
      [{ id: "r2", author_name: "A", author_country: null, rating: 4, title: null, content: "Ok", locale: "vi", travel_date: null, is_verified: true, tours: null }],
      "vi",
    );
    expect(noTour[0]).toMatchObject({ tour: null, verified: true });
  });

  it("summarises ratings", () => {
    expect(ratingSummary([])).toEqual({ count: 0, average: null });
    expect(ratingSummary([5, 4, 4])).toEqual({ count: 3, average: 4.3 });
  });
});
