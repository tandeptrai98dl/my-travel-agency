import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import type { Locale } from "@/modules/catalog/public/types";

/** Destinations and articles matching a term (anon; `search_site` is security invoker). */
export async function searchSite(locale: Locale, q: string, limit: number) {
  return createPublicClient().rpc("search_site", { p_locale: locale, p_q: q, p_limit: limit });
}
