import "server-only";

import { getTranslations } from "next-intl/server";

import { getPathname } from "@/i18n/navigation";

/** Text for LocaleBadges (server-rendered lists). */
export async function getLocaleBadgeLabels() {
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Form" });
  return {
    vi: t("vi"),
    en: t("en"),
    published: t("published"),
    unpublished: t("unpublished"),
    missing: t("notTranslated"),
  };
}

/** Public path before the slug in each language, shown in SlugInput ("/diem-den/", "/en/destinations/"). */
export function slugPrefixes(kind: "destination" | "travelStyle"): Record<"vi" | "en", string> {
  const pathname = kind === "destination" ? "/destinations/[slug]" : "/travel-styles/[slug]";
  const prefix = (locale: "vi" | "en") =>
    getPathname({ href: { pathname, params: { slug: "_" } }, locale }).replace(/_$/, "");
  return { vi: prefix("vi"), en: prefix("en") };
}
