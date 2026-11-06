import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { createPublicClient } from "@/lib/supabase/public";

import {
  companySettingsSchema,
  contactSettingsSchema,
  type PublicSettings,
  socialSettingsSchema,
} from "./settings.schemas";

/** Cache tag refreshed by the admin when settings are saved (Phase 2, ADR-015). */
export const SETTINGS_TAG = "settings";

const EMPTY: PublicSettings = { company: null, contact: null, social: {} };

/** Turns raw rows into validated settings; invalid or missing keys become null, never a crash. */
export function parsePublicSettings(rows: { key: string; value: unknown }[]): PublicSettings {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const company = companySettingsSchema.safeParse(byKey.get("company"));
  const contact = contactSettingsSchema.safeParse(byKey.get("contact"));
  const social = socialSettingsSchema.safeParse(byKey.get("social") ?? {});
  return {
    company: company.success ? company.data : null,
    contact: contact.success ? contact.data : null,
    social: social.success ? social.data : {},
  };
}

/**
 * Public company, contact and social settings for the site shell. Cached and refreshed by tag;
 * read as anon, so RLS returns only `is_public` keys. A database error yields empty settings
 * (the shell renders without them) instead of failing the page.
 */
export async function getPublicSettings(): Promise<PublicSettings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("minutes");

  try {
    const { data, error } = await createPublicClient()
      .from("settings")
      .select("key, value")
      .in("key", ["company", "contact", "social"])
      .eq("is_public", true);
    if (error) throw error;
    return parsePublicSettings(data ?? []);
  } catch (error) {
    console.error("getPublicSettings failed", error instanceof Error ? error.message : error);
    // Do not keep a failure for the whole "minutes" profile: retry soon.
    cacheLife("seconds");
    return EMPTY;
  }
}
