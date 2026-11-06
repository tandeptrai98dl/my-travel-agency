import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type MediaInsert = Database["public"]["Tables"]["media"]["Insert"];

export const MEDIA_BUCKET = "media";
const COLUMNS = "id, path, mime_type, width, height, size_bytes, blur_data_url, alt, credit, created_at";

/**
 * Data access with the staff member's session: Storage and table RLS allow editor and admin
 * only (supabase/migrations/*_storage.sql, *_rls_policies.sql), after requirePermission().
 */
export async function createSignedUpload(path: string) {
  const supabase = await createClient();
  return supabase.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
}

export async function downloadObject(path: string) {
  const supabase = await createClient();
  return supabase.storage.from(MEDIA_BUCKET).download(path);
}

export async function removeObject(path: string) {
  const supabase = await createClient();
  return supabase.storage.from(MEDIA_BUCKET).remove([path]);
}

export async function publicUrlFor(path: string): Promise<string> {
  const supabase = await createClient();
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function insertMedia(row: MediaInsert) {
  const supabase = await createClient();
  return supabase.from("media").insert(row).select(COLUMNS).single();
}

export async function findMediaByPath(path: string) {
  const supabase = await createClient();
  return supabase.from("media").select(COLUMNS).eq("bucket", MEDIA_BUCKET).eq("path", path).maybeSingle();
}

export async function findMediaById(id: string) {
  const supabase = await createClient();
  return supabase.from("media").select(COLUMNS).eq("id", id).maybeSingle();
}

export async function updateMediaRow(id: string, values: { alt: { vi: string; en: string }; credit: string | null }) {
  const supabase = await createClient();
  return supabase.from("media").update(values).eq("id", id).select(COLUMNS).single();
}

export async function deleteMediaRow(id: string) {
  const supabase = await createClient();
  return supabase.from("media").delete().eq("id", id);
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
    query = query.or(`path.ilike.${pattern},alt->>vi.ilike.${pattern},alt->>en.ilike.${pattern}`);
  }
  return query;
}

export type MediaRow = NonNullable<Awaited<ReturnType<typeof findMediaById>>["data"]>;
