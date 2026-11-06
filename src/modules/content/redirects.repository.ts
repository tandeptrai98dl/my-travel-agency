import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Redirects with the staff session (RLS: editor and admin). */
const db = createClient;

export async function listRedirectRows(params: { q: string; range: [number, number] }) {
  let query = (await db())
    .from("redirects")
    .select("id, from_path, to_path, status_code, hits, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id")
    .range(params.range[0], params.range[1]);
  if (params.q) query = query.or(`from_path.ilike.*${params.q}*,to_path.ilike.*${params.q}*`);
  return query;
}

/** Every redirect, in pages (resync). */
export async function allRedirectRows(from: number, to: number) {
  return (await db()).from("redirects").select("from_path, to_path, status_code").order("from_path").range(from, to);
}

export async function redirectsTo(path: string) {
  return (await db()).from("redirects").select("from_path, to_path, status_code").eq("to_path", path);
}

/** Checks, flattening and insert in one transaction (create_redirect, *_review_followups.sql). */
export async function createRedirect(row: { from_path: string; to_path: string; status_code: number }) {
  return (await db()).rpc("create_redirect", { source: row.from_path, target: row.to_path, status: row.status_code });
}

export async function deleteRedirectRow(id: string) {
  return (await db()).from("redirects").delete().eq("id", id).select("from_path");
}
