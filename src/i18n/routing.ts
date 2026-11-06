import { defineRouting } from "next-intl/routing";

import { pathnames } from "./pathnames";

export const routing = defineRouting({
  locales: ["vi", "en"],
  defaultLocale: "vi",
  // Vietnamese has no prefix; English lives under /en (ADR-006).
  localePrefix: "as-needed",
  // No Accept-Language redirects: every URL serves one fixed language, which keeps pages
  // cacheable and lets search engines index both versions.
  localeDetection: false,
  // No NEXT_LOCALE cookie: detection is off, so it would never be read and would only add
  // Set-Cookie to otherwise cacheable pages.
  localeCookie: false,
  // No automatic hreflang Link header: pages declare hreflang in generateMetadata, and only for
  // languages with a published translation (ARCHITECTURE.md "Routes").
  alternateLinks: false,
  pathnames,
});

export type Locale = (typeof routing.locales)[number];
