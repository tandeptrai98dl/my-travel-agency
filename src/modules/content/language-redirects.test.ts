import { describe, expect, it } from "vitest";

import { languagePairs, liveTopicRows } from "./language-redirects";

describe("languagePairs", () => {
  it("sends the other language's slug to this language's URL, both ways", () => {
    expect(
      languagePairs(
        [
          { id: "t1", locale: "vi", slug: "du-thuyen-vinh-ha-long" },
          { id: "t1", locale: "en", slug: "ha-long-bay-cruise" },
        ],
        "/tours/[slug]",
      ),
    ).toEqual([
      ["/tours/ha-long-bay-cruise", "/tours/du-thuyen-vinh-ha-long"],
      ["/en/tours/du-thuyen-vinh-ha-long", "/en/tours/ha-long-bay-cruise"],
    ]);
  });

  it("uses the localized route segments", () => {
    expect(languagePairs([{ id: "d", locale: "vi", slug: "viet-nam" }, { id: "d", locale: "en", slug: "vietnam" }], "/destinations/[slug]")).toEqual([
      ["/diem-den/vietnam", "/diem-den/viet-nam"],
      ["/en/destinations/viet-nam", "/en/destinations/vietnam"],
    ]);
  });

  it("skips one-language pages, equal slugs and slugs that are real pages of the other entity", () => {
    expect(
      languagePairs(
        [
          { id: "a", locale: "vi", slug: "chi-tieng-viet" },
          { id: "b", locale: "vi", slug: "kyoto" },
          { id: "b", locale: "en", slug: "kyoto" },
          { id: "c", locale: "vi", slug: "hue" },
          { id: "c", locale: "en", slug: "hue-imperial" },
          { id: "d", locale: "en", slug: "hue" },
          { id: "x", locale: "fr", slug: "x" },
        ],
        "/journal/[slug]",
      ),
    ).toEqual([["/journal/hue-imperial", "/journal/hue"]]);
  });
});

describe("liveTopicRows", () => {
  it("keeps a topic only in the languages that have a published article in it", () => {
    const topics = [
      { id: "c1", locale: "vi", slug: "cam-hung" },
      { id: "c1", locale: "en", slug: "inspiration" },
      { id: "c2", locale: "vi", slug: "cam-nang" },
      { id: "c2", locale: "en", slug: "guides" },
    ];
    const posts = [
      { category_id: "c1", post_translations: [{ locale: "vi" }, { locale: "en" }] },
      { category_id: "c2", post_translations: [{ locale: "vi" }] },
      { category_id: null, post_translations: [{ locale: "en" }] },
    ];
    expect(liveTopicRows(topics, posts).map((row) => `${row.id}:${row.locale}`)).toEqual(["c1:vi", "c1:en", "c2:vi"]);
    // c2 has no English article: no pair, so /en/journal/topics/cam-nang is not sent to a 404.
    expect(languagePairs(liveTopicRows(topics, posts), "/journal/topics/[slug]").map(([from]) => from)).toEqual(["/journal/chu-de/inspiration", "/en/journal/topics/cam-hung"]);
  });
});
