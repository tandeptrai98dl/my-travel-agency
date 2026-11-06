import { serializeJsonLd } from "./serialize-json-ld";

/**
 * Structured data for search engines (Phase 3 spec decision 10). The JSON is escaped so content
 * can never close the script element or open an HTML comment.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
