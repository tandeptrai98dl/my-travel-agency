import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

type Value = NonNullable<Json>;

/** Settings with the staff session: RLS lets only an MFA-verified admin write (ADR-009). */
const db = createClient;

export async function readSettingsRows(keys: readonly string[]) {
  return (await db()).from("settings").select("key, value, updated_at").in("key", [...keys]);
}

export async function upsertSetting(row: { key: string; value: Value; is_public: boolean; updated_by: string }) {
  return (await db()).from("settings").upsert(row, { onConflict: "key" }).select("key").single();
}

export async function destinationOptions() {
  return (await db())
    .from("destinations")
    .select("key, type, status, sort_order, destination_translations(locale, name)")
    .order("sort_order")
    .order("key");
}

export async function findMedia(id: string) {
  return (await db()).from("media").select("id, path, alt").eq("id", id).maybeSingle();
}
