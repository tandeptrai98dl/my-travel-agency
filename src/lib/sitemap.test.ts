import { describe, expect, it } from "vitest";

import { isSitemapType, newest, sitemapIndexXml, urlsetXml } from "./sitemap";

const site = new URL("https://example.vn");

describe("sitemap XML", () => {
  it("writes absolute, escaped URLs once each, with lastmod in UTC when known", () => {
    const xml = urlsetXml(
      [
        { path: "/tours/du-thuyen", lastModified: "2026-11-07T10:00:00+07:00" },
        { path: "/en/tours/a&b", lastModified: null },
        { path: "/tours/du-thuyen", lastModified: null },
        { path: "/journal", lastModified: "not a date" },
      ],
      site,
    );
    expect(xml).toContain("<url><loc>https://example.vn/tours/du-thuyen</loc><lastmod>2026-11-07T03:00:00.000Z</lastmod></url>");
    expect(xml).toContain("<url><loc>https://example.vn/en/tours/a&amp;b</loc></url>");
    expect(xml).toContain("<url><loc>https://example.vn/journal</loc></url>");
    expect(xml.match(/du-thuyen/g)).toHaveLength(1);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("lists one sitemap per type in the index", () => {
    const xml = sitemapIndexXml(site);
    for (const type of ["pages", "tours", "destinations", "travel-styles", "journal"]) {
      expect(xml).toContain(`<sitemap><loc>https://example.vn/sitemaps/${type}.xml</loc></sitemap>`);
    }
  });

  it("knows its types and picks the newest timestamp", () => {
    expect(isSitemapType("tours")).toBe(true);
    expect(isSitemapType("admin")).toBe(false);
    expect(newest(null, "2026-11-01T00:00:00Z", "2026-11-03T00:00:00Z", undefined)).toBe("2026-11-03T00:00:00Z");
    expect(newest()).toBeNull();
  });
});
