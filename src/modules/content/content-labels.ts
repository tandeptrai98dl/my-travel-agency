import "server-only";

import { getPathname } from "@/i18n/navigation";

import { POLICY_PAGE_KEYS } from "./content.schemas";

type Pathname = "/journal/[slug]" | "/journal/topics/[slug]" | "/policies/[slug]";

function prefixes(pathname: Pathname): Record<"vi" | "en", string> {
  const prefix = (locale: "vi" | "en") => getPathname({ href: { pathname, params: { slug: "_" } }, locale }).replace(/_$/, "");
  return { vi: prefix("vi"), en: prefix("en") };
}

/** Public path before the slug in each language, shown in SlugInput ("/journal/", "/en/journal/"). */
export function contentSlugPrefixes(kind: "post" | "category"): Record<"vi" | "en", string> {
  return prefixes(kind === "post" ? "/journal/[slug]" : "/journal/topics/[slug]");
}

/** Policies live at /policies/[slug]; about and FAQ have fixed routes (null). */
export function pageSlugPrefixes(key: string): Record<"vi" | "en", string> | null {
  return (POLICY_PAGE_KEYS as readonly string[]).includes(key) ? prefixes("/policies/[slug]") : null;
}
