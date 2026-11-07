import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { openGraphImageUrl, type ImageData } from "@/lib/images";
import type { LocaleLinks } from "@/modules/catalog/public/types";

/**
 * Metadata for a public page with per-language paths (decision 5): canonical, hreflang for the
 * published languages (plus `x-default` → Vietnamese when published), Open Graph with the page's
 * photo as a 1200×630 rendition when it has one.
 */
export function pageMetadata({
  locale,
  title,
  description,
  alternates,
  image,
  type = "website",
  publishedTime,
  noindex = false,
}: {
  locale: "vi" | "en";
  title: string;
  description?: string | null;
  alternates: LocaleLinks;
  image?: ImageData | null;
  type?: "website" | "article";
  publishedTime?: string | null;
  noindex?: boolean;
}): Metadata {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) if (alternates[l].available) languages[l] = alternates[l].href;
  if (alternates.vi.available) languages["x-default"] = alternates.vi.href;
  const og = image ? openGraphImageUrl(image.src) : null;
  return {
    title,
    description: description ?? undefined,
    alternates: { canonical: alternates[locale].href, languages },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type,
      title,
      description: description ?? undefined,
      url: alternates[locale].href,
      locale: locale === "vi" ? "vi_VN" : "en_GB",
      ...(type === "article" && publishedTime ? { publishedTime } : {}),
      images: og && image ? [{ ...og, alt: image.alt }] : undefined,
    },
  };
}

/** Per-language paths of a page that exists in both languages at fixed routes. */
export function fixedLocaleLinks(paths: Record<"vi" | "en", string>): LocaleLinks {
  return { vi: { href: paths.vi, available: true }, en: { href: paths.en, available: true } };
}
