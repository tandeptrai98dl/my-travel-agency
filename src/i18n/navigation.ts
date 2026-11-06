import { type Locale, type LocalizedHref, localizedPath } from "./paths";

/**
 * Localized paths and links for server code. These deliberately avoid next-intl's
 * `createNavigation`: its module imports next-intl's client `Link`, and any client module reachable
 * from a public page's server graph is loaded with the page, together with next-intl's message
 * formatter (about 12 KB gzip; Phase 3 spec decision 16). `paths.test.ts` checks that the result
 * matches next-intl's own `getPathname` for every route.
 */
export function getPathname({ href, locale }: { href: LocalizedHref; locale: Locale }): string {
  return localizedPath(locale, href);
}

export { Link } from "./link";
