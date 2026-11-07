import { describe, expect, it } from "vitest";

import { slugParams } from "./static-params";

const slugs: Record<string, string[]> = { vi: ["vinh-ha-long", "kyoto"], en: ["ha-long-bay", "kyoto"] };
const list = async (locale: string) => slugs[locale] ?? [];

describe("slugParams", () => {
  it("lists this language's slugs, then the other language's, once each", async () => {
    expect(await slugParams("vi", list, "none")).toEqual([{ slug: "vinh-ha-long" }, { slug: "kyoto" }, { slug: "ha-long-bay" }]);
    expect(await slugParams("en", list, "none")).toEqual([{ slug: "ha-long-bay" }, { slug: "kyoto" }, { slug: "vinh-ha-long" }]);
  });

  it("falls back to the sentinel when nothing is published or the locale is unknown", async () => {
    expect(await slugParams("vi", async () => [], "none")).toEqual([{ slug: "none" }]);
    expect(await slugParams("fr", list, "none")).toEqual([{ slug: "none" }]);
  });
});
