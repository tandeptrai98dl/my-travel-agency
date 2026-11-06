import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { createPublicClient } from "@/lib/supabase/public";

import { buildDestinationTree, type DestinationNode, type DestinationRow } from "./destinations";

/** Cache tag refreshed when destinations change (Phase 2, ADR-015). */
export const DESTINATIONS_TAG = "destinations";

/**
 * Published destinations as a country → region → city tree, in one language. Destinations
 * without a published translation in that language are left out (ADR-016). Cached per locale.
 */
export async function getDestinationTree(locale: "vi" | "en"): Promise<DestinationNode[]> {
  "use cache";
  cacheTag(DESTINATIONS_TAG);
  cacheLife("minutes");

  try {
    const { data, error } = await createPublicClient()
      .from("destinations")
      .select(
        "id, key, type, parent_id, sort_order, destination_translations!inner(slug, name, locale)",
      )
      .eq("status", "published")
      .eq("destination_translations.locale", locale)
      .eq("destination_translations.is_published", true);
    if (error) throw error;

    const rows: DestinationRow[] = (data ?? []).flatMap((row) => {
      const translation = row.destination_translations[0];
      return translation
        ? [
            {
              id: row.id,
              key: row.key,
              type: row.type,
              parentId: row.parent_id,
              sortOrder: row.sort_order,
              slug: translation.slug,
              name: translation.name,
            },
          ]
        : [];
    });
    return buildDestinationTree(rows);
  } catch (error) {
    console.error("getDestinationTree failed", error instanceof Error ? error.message : error);
    // Do not keep a failure for the whole "minutes" profile: retry soon.
    // Retry soon, but stay prerenderable: an entry expiring in under 5 minutes would turn the
    // layout into a dynamic hole and fail the build (or a background render) during an outage.
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    return [];
  }
}
