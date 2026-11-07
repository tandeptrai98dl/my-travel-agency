import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

/**
 * Published catalog translations with their last change, for sitemap.xml (Phase 3 spec step 19).
 * Read as anon (RLS returns published rows only; the filters repeat it). PostgREST returns at
 * most 1,000 rows per query; paginate with `.range()` when the catalog grows past that.
 */

export async function listTourEntries() {
  return createPublicClient()
    .from("tour_translations")
    .select("locale, slug, tours!inner(status, updated_at)")
    .eq("is_published", true)
    .eq("tours.status", "published")
    .limit(1000);
}

export async function listDestinationEntries() {
  return createPublicClient()
    .from("destination_translations")
    .select("locale, slug, destination_id, destinations!inner(status, updated_at)")
    .eq("is_published", true)
    .eq("destinations.status", "published")
    .limit(1000);
}

export async function listTravelStyleEntries() {
  return createPublicClient()
    .from("travel_style_translations")
    .select("locale, slug, travel_styles!inner(status)")
    .eq("is_published", true)
    .eq("travel_styles.status", "published")
    .limit(1000);
}
