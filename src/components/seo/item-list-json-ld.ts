import { siteUrl } from "@/lib/site-url";

/** `ItemList` of page URLs for listing-style pages (Phase 3 spec decision 10). */
export function itemListJsonLd(name: string, paths: string[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: paths.length,
    itemListElement: paths.map((path, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: new URL(path, siteUrl).toString(),
    })),
  };
}
