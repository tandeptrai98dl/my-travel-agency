import "server-only";

import { publicEnv } from "@/lib/env/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type MediaInsert = Database["public"]["Tables"]["media"]["Insert"];

/** Public bucket: only checked, re-encoded copies written by the server (ADR-023). */
export const MEDIA_BUCKET = "media";
/** Private staging bucket the browser uploads originals to; no API-role policies. */
export const UPLOADS_BUCKET = "media-uploads";
const COLUMNS =
  "id, path, original_name, mime_type, width, height, size_bytes, blur_data_url, alt, credit, created_at";
/** Paths are random UUIDs and never reused, so the public copies can be cached for a year. */
const CACHE_SECONDS = "31536000";

// --- Storage with the service role --------------------------------------------------------------
// Callers (media.service.ts) have already passed requirePermission("media.manage") and checked
// that the staged path belongs to the signed-in user. The service role is needed because no API
// role can write to the public bucket or touch the staging bucket at all
// (supabase/migrations/*_media_uploads_bucket.sql).

export async function createSignedUpload(path: string) {
  return createAdminClient().storage.from(UPLOADS_BUCKET).createSignedUploadUrl(path);
}

export async function downloadStaged(path: string) {
  return createAdminClient().storage.from(UPLOADS_BUCKET).download(path);
}

export async function removeStaged(path: string) {
  return createAdminClient().storage.from(UPLOADS_BUCKET).remove([path]);
}

/**
 * One page of the staging bucket under `prefix` (`pending` or `pending/<user id>`), for the daily
 * cleanup of abandoned uploads (`/api/cron/housekeeping`, after the CRON_SECRET check). Storage
 * lists one level at a time: folders come back with `id` null.
 */
export async function listStaged(prefix: string, offset: number, limit: number) {
  return createAdminClient().storage.from(UPLOADS_BUCKET).list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
}

export async function removeStagedMany(paths: string[]) {
  return createAdminClient().storage.from(UPLOADS_BUCKET).remove(paths);
}

export async function uploadPublic(path: string, body: Buffer, contentType: string) {
  return createAdminClient()
    .storage.from(MEDIA_BUCKET)
    // Upsert: only the server writes here, at a path derived from its own UUID, so a retry after
    // a finalize that died between upload and insert simply replaces the same checked copy.
    .upload(path, body, { contentType, cacheControl: CACHE_SECONDS, upsert: true });
}

export async function removePublicAsService(path: string) {
  return createAdminClient().storage.from(MEDIA_BUCKET).remove([path]);
}

// --- Everything else with the staff member's session (RLS: editor and admin) ------------------

export async function removePublic(path: string) {
  const supabase = await createClient();
  return supabase.storage.from(MEDIA_BUCKET).remove([path]);
}

/** Same URL `getPublicUrl()` builds, without creating a client per row. */
export function publicUrlFor(path: string): string {
  const base = publicEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${encoded}`;
}

export async function insertMedia(row: MediaInsert) {
  const supabase = await createClient();
  return supabase.from("media").insert(row).select(COLUMNS).single();
}

/** The public copy of a staged upload, whatever month it was published in. */
export async function findMediaByUploadId(uuid: string, ext: string) {
  const supabase = await createClient();
  return supabase
    .from("media")
    .select(COLUMNS)
    .eq("bucket", MEDIA_BUCKET)
    .like("path", `%/${uuid}.${ext}`)
    .maybeSingle();
}

export async function findMediaById(id: string) {
  const supabase = await createClient();
  return supabase.from("media").select(COLUMNS).eq("id", id).maybeSingle();
}

export async function updateMediaRow(id: string, values: { alt: { vi: string; en: string }; credit: string | null }) {
  const supabase = await createClient();
  return supabase.from("media").update(values).eq("id", id).select(COLUMNS).single();
}

/** Returns the deleted ids, so the caller removes the file only when the row really went. */
export async function deleteMediaRow(id: string) {
  const supabase = await createClient();
  return supabase.from("media").delete().eq("id", id).select("id");
}

export async function searchMedia(params: { search: string; from: number; to: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("media")
    .select(COLUMNS, { count: "exact" })
    .eq("bucket", MEDIA_BUCKET)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(params.from, params.to);
  if (params.search) {
    const pattern = `*${params.search}*`;
    query = query.or(
      `original_name.ilike.${pattern},alt->>vi.ilike.${pattern},alt->>en.ilike.${pattern}`,
    );
  }
  return query;
}

export type MediaRow = NonNullable<Awaited<ReturnType<typeof findMediaById>>["data"]>;
