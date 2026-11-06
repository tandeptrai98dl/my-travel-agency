import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];

/**
 * Tour data access with the staff member's session, after requirePermission(). RLS: editor and
 * admin write tours; the price guard and publish triggers (*_tour_rules.sql) apply on top.
 */
const db = createClient;

const TRANSLATION_COLUMNS =
  "id, locale, slug, title, subtitle, summary, highlights, itinerary, inclusions, exclusions, practical_info, faqs, seo_title, seo_description, og_media_id, is_published";
const TOUR_COLUMNS =
  "id, code, type, scope, status, duration_days, duration_nights, min_pax, max_pax, min_pax_to_operate, from_price, deposit_percent, balance_due_days, child_age_max, infant_age_max, is_featured, hero_media_id, cancellation_policy_id, published_at, updated_at";

export async function listTourRows(params: {
  q: string;
  /** Tours whose title matched the search (searched separately). */
  ids: string[];
  filters: Record<string, string>;
  sort: string;
  ascending: boolean;
  from: number;
  to: number;
}) {
  const supabase = await db();
  let query = supabase
    .from("tours")
    .select(
      "id, code, type, scope, status, duration_days, is_featured, updated_at, tour_translations(locale, title, is_published)",
      { count: "exact" },
    )
    .order(params.sort, { ascending: params.ascending })
    .order("id")
    .range(params.from, params.to);
  if (params.filters.status) query = query.eq("status", params.filters.status as Tables["tours"]["Row"]["status"]);
  if (params.filters.type) query = query.eq("type", params.filters.type as Tables["tours"]["Row"]["type"]);
  if (params.filters.scope) query = query.eq("scope", params.filters.scope as Tables["tours"]["Row"]["scope"]);
  if (params.q) {
    const byTitle = params.ids.length ? `,id.in.(${params.ids.join(",")})` : "";
    query = query.or(`code.ilike.*${params.q}*${byTitle}`);
  }
  return query;
}

/** Tours whose title in any language matches (for the list search). */
export async function findTourIdsByTitle(search: string) {
  const supabase = await db();
  return supabase.from("tour_translations").select("tour_id").ilike("title", `%${search}%`).limit(200);
}

export async function nextDepartures(tourIds: string[]) {
  if (tourIds.length === 0) return { data: [], error: null };
  const supabase = await db();
  return supabase
    .from("departures")
    .select("tour_id, start_date")
    .in("tour_id", tourIds)
    .neq("status", "cancelled")
    .gte("start_date", new Date().toISOString().slice(0, 10))
    .order("start_date");
}

export async function findTour(id: string) {
  const supabase = await db();
  return supabase
    .from("tours")
    .select(
      `${TOUR_COLUMNS}, tour_translations(${TRANSLATION_COLUMNS}), tour_media(media_id, sort_order), tour_destinations(destination_id), tour_travel_styles(travel_style_id)`,
    )
    .eq("id", id)
    .maybeSingle();
}

export async function countActiveDepartures(tourId: string) {
  const supabase = await db();
  const { count, error } = await supabase
    .from("departures")
    .select("id", { count: "exact", head: true })
    .eq("tour_id", tourId)
    .neq("status", "cancelled");
  return { count: count ?? 0, error };
}

export async function insertTour(row: Tables["tours"]["Insert"]) {
  return (await db()).from("tours").insert(row).select("id").single();
}

export async function updateTour(id: string, row: Tables["tours"]["Update"]) {
  return (await db()).from("tours").update(row).eq("id", id).select("id").single();
}

export async function deleteTourRow(id: string) {
  return (await db()).from("tours").delete().eq("id", id);
}

export async function upsertTourTranslation(row: Tables["tour_translations"]["Insert"]) {
  return (await db()).from("tour_translations").upsert(row, { onConflict: "tour_id,locale" });
}

export async function deleteTourTranslation(tourId: string, locale: "vi" | "en") {
  return (await db()).from("tour_translations").delete().eq("tour_id", tourId).eq("locale", locale);
}

/** Replaces a tour's links (gallery order, destinations, styles) with the given ones. */
export async function replaceTourLinks(
  tourId: string,
  links: { media: string[]; destinations: string[]; styles: string[] },
) {
  const supabase = await db();
  const media = await supabase.from("tour_media").delete().eq("tour_id", tourId);
  if (media.error) return media;
  if (links.media.length) {
    const rows = links.media.map((media_id, sort_order) => ({ tour_id: tourId, media_id, sort_order }));
    const inserted = await supabase.from("tour_media").insert(rows);
    if (inserted.error) return inserted;
  }
  const destinations = await supabase.from("tour_destinations").delete().eq("tour_id", tourId);
  if (destinations.error) return destinations;
  if (links.destinations.length) {
    const rows = links.destinations.map((destination_id) => ({ tour_id: tourId, destination_id }));
    const inserted = await supabase.from("tour_destinations").insert(rows);
    if (inserted.error) return inserted;
  }
  const styles = await supabase.from("tour_travel_styles").delete().eq("tour_id", tourId);
  if (styles.error) return styles;
  if (links.styles.length) {
    const rows = links.styles.map((travel_style_id) => ({ tour_id: tourId, travel_style_id }));
    const inserted = await supabase.from("tour_travel_styles").insert(rows);
    if (inserted.error) return inserted;
  }
  return { error: null };
}

export async function findTourSlugOwner(locale: "vi" | "en", slug: string) {
  const supabase = await db();
  const { data, error } = await supabase
    .from("tour_translations")
    .select("tour_id")
    .eq("locale", locale)
    .eq("slug", slug)
    .maybeSingle();
  return { ownerId: data?.tour_id ?? null, error };
}

export async function tourCodeTaken(code: string) {
  const supabase = await db();
  const { count, error } = await supabase.from("tours").select("id", { count: "exact", head: true }).eq("code", code);
  return { taken: (count ?? 0) > 0, error };
}

/** Choices for the editor: destinations (with their Vietnamese names), styles and policies. */
export async function editorOptions() {
  const supabase = await db();
  const [destinations, styles, policies] = await Promise.all([
    supabase
      .from("destinations")
      .select("id, key, type, parent_id, sort_order, destination_translations(locale, name)")
      .order("sort_order")
      .order("key"),
    supabase
      .from("travel_styles")
      .select("id, key, sort_order, travel_style_translations(locale, name)")
      .order("sort_order")
      .order("key"),
    supabase.from("cancellation_policies").select("id, name, version, is_default").order("name"),
  ]);
  return { destinations, styles, policies };
}

export async function saveRedirect(fromPath: string, toPath: string) {
  const supabase = await db();
  await supabase.from("redirects").delete().eq("from_path", toPath);
  await supabase.from("redirects").update({ to_path: toPath }).eq("to_path", fromPath);
  return supabase.from("redirects").upsert({ from_path: fromPath, to_path: toPath, status_code: 301 }, { onConflict: "from_path" });
}

export async function findMediaRows(ids: string[]) {
  return (await db()).from("media").select("id, path, alt").in("id", ids);
}

export type TourRow = NonNullable<Awaited<ReturnType<typeof findTour>>["data"]>;
