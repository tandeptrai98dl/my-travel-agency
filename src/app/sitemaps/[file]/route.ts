import { siteUrl } from "@/lib/site-url";
import { isSitemapType, SITEMAP_TYPES, type SitemapEntry, type SitemapType, urlsetXml } from "@/lib/sitemap";
import { getDestinationSitemap, getTourSitemap, getTravelStyleSitemap } from "@/modules/catalog/public/sitemap.service";
import { getJournalSitemap, getPageSitemap } from "@/modules/content/public/sitemap.service";

/**
 * One sitemap per content type, `/sitemaps/<type>.xml` (Phase 3 spec step 19): published pages in
 * each language. The reads are cached with the admin's tags, so a save refreshes them.
 */

const READERS: Record<SitemapType, () => Promise<SitemapEntry[]>> = {
  pages: getPageSitemap,
  tours: getTourSitemap,
  destinations: getDestinationSitemap,
  "travel-styles": getTravelStyleSitemap,
  journal: getJournalSitemap,
};

export function generateStaticParams() {
  return SITEMAP_TYPES.map((type) => ({ file: `${type}.xml` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const type = file.endsWith(".xml") ? file.slice(0, -4) : "";
  if (!isSitemapType(type)) return new Response("Not found", { status: 404 });
  try {
    const entries = await READERS[type]();
    return new Response(urlsetXml(entries, siteUrl), { headers: { "content-type": "application/xml; charset=utf-8" } });
  } catch (error) {
    console.error("sitemap failed", type, error instanceof Error ? error.message : error);
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "cache-control": "no-store", "retry-after": "60" } });
  }
}
