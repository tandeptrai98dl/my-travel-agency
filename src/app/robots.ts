import type { MetadataRoute } from "next";

import { localizedPath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site-url";

/**
 * robots.txt (Phase 3 spec step 19): the admin, the API, staff sign-in, account, checkout, booking
 * lookup, site search and filtered listings stay out of crawls. Paged listings without filters
 * (`/tours?page=2`, the only query that comes first in the canonical order) stay crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  const perLocale = (href: Parameters<typeof localizedPath>[1]) => routing.locales.map((locale) => localizedPath(locale, href));
  const listings = perLocale("/tours");
  return {
    rules: {
      userAgent: "*",
      allow: ["/", ...listings.map((path) => `${path}?page=`)],
      disallow: [
        "/admin",
        "/api/",
        "/auth/",
        ...perLocale("/account"),
        ...perLocale({ pathname: "/book/[tourSlug]", params: { tourSlug: "" } }),
        ...perLocale({ pathname: "/checkout/[code]", params: { code: "" } }),
        ...perLocale({ pathname: "/pay/[token]", params: { token: "" } }),
        ...perLocale("/booking-lookup"),
        ...perLocale("/search"),
        ...listings.map((path) => `${path}?`),
      ],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
