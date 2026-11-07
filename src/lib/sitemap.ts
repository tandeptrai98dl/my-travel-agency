/**
 * sitemap.xml helpers (Phase 3 spec step 19): one sitemap per content type, listed by an index.
 * Entries carry a site path (already localized) and, where the table records it, the time of
 * the last change.
 */

export const SITEMAP_TYPES = ["pages", "tours", "destinations", "travel-styles", "journal"] as const;
export type SitemapType = (typeof SITEMAP_TYPES)[number];

export type SitemapEntry = { path: string; lastModified: string | null };

export function isSitemapType(value: string): value is SitemapType {
  return (SITEMAP_TYPES as readonly string[]).includes(value);
}

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** A timestamp as W3C datetime (UTC), or nothing when it cannot be read. */
function lastmod(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

/** A `<urlset>` of absolute URLs, each path once (the first entry wins). */
export function urlsetXml(entries: SitemapEntry[], site: URL): string {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const entry of entries) {
    const loc = new URL(entry.path, site).toString();
    if (seen.has(loc)) continue;
    seen.add(loc);
    const modified = lastmod(entry.lastModified);
    urls.push(`<url><loc>${escapeXml(loc)}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ""}</url>`);
  }
  return `${XML_HEAD}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/** The index of the per-type sitemaps (`/sitemaps/<type>.xml`). */
export function sitemapIndexXml(site: URL): string {
  const items = SITEMAP_TYPES.map((type) => `<sitemap><loc>${escapeXml(new URL(`/sitemaps/${type}.xml`, site).toString())}</loc></sitemap>`);
  return `${XML_HEAD}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`;
}

/** The newest of several timestamps (an entry's last change across its rows). */
export function newest(...values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const value of values) if (value && (!best || Date.parse(value) > Date.parse(best))) best = value;
  return best;
}
