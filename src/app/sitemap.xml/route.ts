import { siteUrl } from "@/lib/site-url";
import { sitemapIndexXml } from "@/lib/sitemap";

/** The sitemap index: one sitemap per content type (Phase 3 spec step 19). */
export function GET() {
  return new Response(sitemapIndexXml(siteUrl), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
