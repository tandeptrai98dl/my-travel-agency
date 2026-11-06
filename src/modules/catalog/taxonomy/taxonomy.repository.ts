import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];

/**
 * Taxonomy data access with the staff member's session (RLS: editor and admin write
 * destinations and travel styles; admin writes cancellation policies), after requirePermission().
 */
const db = createClient;

// Destinations --------------------------------------------------------------------------------------
export async function listDestinationRows() {
  return (await db())
    .from("destinations")
    .select("id, key, type, parent_id, status, sort_order, destination_translations(locale, name, is_published)")
    .order("sort_order")
    .order("key");
}

export async function findDestination(id: string) {
  return (await db())
    .from("destinations")
    .select(
      "id, key, type, parent_id, status, hero_media_id, latitude, longitude, sort_order, destination_translations(id, locale, slug, name, summary, best_time_to_visit, seo_title, seo_description, is_published)",
    )
    .eq("id", id)
    .maybeSingle();
}

export async function insertDestination(row: Tables["destinations"]["Insert"]) {
  return (await db()).from("destinations").insert(row).select("id").single();
}

export async function updateDestination(id: string, row: Tables["destinations"]["Update"]) {
  return (await db()).from("destinations").update(row).eq("id", id).select("id").single();
}

export async function upsertDestinationTranslation(row: Tables["destination_translations"]["Insert"]) {
  return (await db()).from("destination_translations").upsert(row, { onConflict: "destination_id,locale" });
}

export async function deleteDestinationTranslation(destinationId: string, locale: "vi" | "en") {
  return (await db()).from("destination_translations").delete().eq("destination_id", destinationId).eq("locale", locale);
}

export async function countDestinationUses(id: string) {
  const supabase = await db();
  const [children, tours] = await Promise.all([
    supabase.from("destinations").select("id", { count: "exact", head: true }).eq("parent_id", id),
    supabase.from("tour_destinations").select("tour_id", { count: "exact", head: true }).eq("destination_id", id),
  ]);
  return { children: children.count ?? 0, tours: tours.count ?? 0, error: children.error ?? tours.error };
}

export async function deleteDestinationRow(id: string) {
  return (await db()).from("destinations").delete().eq("id", id);
}

// Travel styles --------------------------------------------------------------------------------------
export async function listTravelStyleRows() {
  return (await db())
    .from("travel_styles")
    .select("id, key, status, sort_order, travel_style_translations(locale, name, is_published)")
    .order("sort_order")
    .order("key");
}

export async function findTravelStyle(id: string) {
  return (await db())
    .from("travel_styles")
    .select(
      "id, key, status, hero_media_id, sort_order, travel_style_translations(id, locale, slug, name, description, seo_title, seo_description, is_published)",
    )
    .eq("id", id)
    .maybeSingle();
}

export async function insertTravelStyle(row: Tables["travel_styles"]["Insert"]) {
  return (await db()).from("travel_styles").insert(row).select("id").single();
}

export async function updateTravelStyle(id: string, row: Tables["travel_styles"]["Update"]) {
  return (await db()).from("travel_styles").update(row).eq("id", id).select("id").single();
}

export async function upsertTravelStyleTranslation(row: Tables["travel_style_translations"]["Insert"]) {
  return (await db()).from("travel_style_translations").upsert(row, { onConflict: "travel_style_id,locale" });
}

export async function deleteTravelStyleTranslation(styleId: string, locale: "vi" | "en") {
  return (await db()).from("travel_style_translations").delete().eq("travel_style_id", styleId).eq("locale", locale);
}

export async function countTravelStyleUses(id: string) {
  const { count, error } = await (await db())
    .from("tour_travel_styles")
    .select("tour_id", { count: "exact", head: true })
    .eq("travel_style_id", id);
  return { tours: count ?? 0, error };
}

export async function deleteTravelStyleRow(id: string) {
  return (await db()).from("travel_styles").delete().eq("id", id);
}

// Slugs and redirects -----------------------------------------------------------------------------------
export async function findSlugOwner(kind: "destination" | "travelStyle", locale: "vi" | "en", slug: string) {
  const supabase = await db();
  if (kind === "destination") {
    const { data, error } = await supabase
      .from("destination_translations")
      .select("destination_id")
      .eq("locale", locale)
      .eq("slug", slug)
      .maybeSingle();
    return { ownerId: data?.destination_id ?? null, error };
  }
  const { data, error } = await supabase
    .from("travel_style_translations")
    .select("travel_style_id")
    .eq("locale", locale)
    .eq("slug", slug)
    .maybeSingle();
  return { ownerId: data?.travel_style_id ?? null, error };
}

/** 301 from an old public path to the new one; earlier redirects to the old path follow along. */
export async function saveRedirect(fromPath: string, toPath: string) {
  const supabase = await db();
  // A redirect away from the new path would now loop.
  await supabase.from("redirects").delete().eq("from_path", toPath);
  await supabase.from("redirects").update({ to_path: toPath }).eq("to_path", fromPath);
  return supabase.from("redirects").upsert({ from_path: fromPath, to_path: toPath, status_code: 301 }, { onConflict: "from_path" });
}

// Cancellation policies -----------------------------------------------------------------------------------
export async function listCancellationPolicyRows() {
  const supabase = await db();
  const [policies, tours] = await Promise.all([
    supabase.from("cancellation_policies").select("id, name, version, rules, summary, is_default, created_at").order("is_default", { ascending: false }).order("name"),
    supabase.from("tours").select("cancellation_policy_id"),
  ]);
  return { policies, tours };
}

export async function findCancellationPolicy(id: string) {
  return (await db()).from("cancellation_policies").select("id, name, version, rules, summary, is_default").eq("id", id).maybeSingle();
}

export async function countPolicyTours(id: string) {
  const { count, error } = await (await db())
    .from("tours")
    .select("id", { count: "exact", head: true })
    .eq("cancellation_policy_id", id);
  return { tours: count ?? 0, error };
}

export async function insertCancellationPolicy(row: Tables["cancellation_policies"]["Insert"]) {
  return (await db()).from("cancellation_policies").insert(row).select("id").single();
}

export async function updateCancellationPolicy(id: string, row: Tables["cancellation_policies"]["Update"]) {
  return (await db()).from("cancellation_policies").update(row).eq("id", id).select("id").single();
}

/** Moves the default flag in one transaction (RLS: admin at aal2). */
export async function setDefaultCancellationPolicy(id: string) {
  return (await db()).rpc("set_default_cancellation_policy", { policy_id: id });
}

export async function deleteCancellationPolicyRow(id: string) {
  return (await db()).from("cancellation_policies").delete().eq("id", id);
}

// Media --------------------------------------------------------------------------------------------------
export async function findMediaSummary(id: string) {
  return (await db()).from("media").select("id, path, alt, blur_data_url").eq("id", id).maybeSingle();
}
