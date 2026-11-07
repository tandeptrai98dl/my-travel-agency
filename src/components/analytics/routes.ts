import { pathnames } from "@/i18n/pathnames";
import { currentRoute, type Locale } from "@/i18n/paths";

import { unsafeValue } from "./scrub";

/**
 * What Google Analytics may learn about a page (Phase 6 spec decision 7, ADR-039). Payment-link
 * tokens and booking codes sit in paths (`/thanh-toan/link/[token]`, `/thanh-toan/[code]/…`), so
 * GA gets the route template from `pathnames` instead of the real path, and never the query.
 */

type Route = keyof typeof pathnames;

/**
 * Routes where GA is not loaded at all (and nothing is sent if it already is): the payment link,
 * booking lookup, the account area and the customer sign-in pages, and the single-use newsletter
 * pages. Only book, checkout and its result may use GA among the secure routes.
 */
export const NO_ANALYTICS_ROUTES: ReadonlySet<string> = new Set<Route>([
  "/pay/[token]",
  "/booking-lookup",
  "/account",
  "/account/bookings",
  "/account/bookings/[code]",
  "/account/profile",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/newsletter/confirm",
]);

/** The template GA receives for unknown paths: never the path someone typed. */
export const NOT_FOUND_TEMPLATE = "/404";

export type PageInfo = { locale: Locale; template: string; params: Record<string, string> };

/** The route template of a browser pathname (`/en/checkout/PTA-…/result` → `/checkout/[code]/result`). */
export function pageInfo(pathname: string): PageInfo {
  const route = currentRoute(pathname);
  const known = Object.hasOwn(pathnames, route.pathname);
  return { locale: route.locale, template: known ? route.pathname : NOT_FOUND_TEMPLATE, params: known ? route.params : {} };
}

/**
 * Whether GA may run on a page. The emailed single-use link opens the checkout with an `access`
 * query (`/thanh-toan/[code]?access=…`, ADR-038), which the template alone cannot tell apart from
 * the checkout itself, so any page carrying `access` is excluded explicitly.
 */
export function analyticsAllowed(pathname: string, search: string): boolean {
  if (new URLSearchParams(search).has("access")) return false;
  return !NO_ANALYTICS_ROUTES.has(pageInfo(pathname).template);
}

/** `page_location`: the site origin plus the template, with no query or fragment. */
export function pageLocation(origin: string, pathname: string): string {
  return origin + pageInfo(pathname).template;
}

/**
 * `page_referrer`: empty, the other site's origin only, or this site's template for a referrer
 * on this site (an earlier page may have held a code or token).
 */
export function pageReferrer(referrer: string, origin: string): string {
  if (!referrer) return "";
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  return url.origin === origin ? origin + pageInfo(url.pathname).template : url.origin;
}

/**
 * `page_title`: the document title, except where the route has a code or token parameter (the
 * checkout titles name the booking code): the template then. Any other parameter value that
 * appears in the title is replaced by its name.
 */
export function pageTitle(title: string, pathname: string): string {
  const { template, params } = pageInfo(pathname);
  if ("code" in params || "token" in params) return template;
  // After a client-side navigation the title may still be the previous page's.
  if (unsafeValue(title)) return template;
  let safe = title;
  for (const [name, value] of Object.entries(params)) {
    if (value.length >= 3) safe = safe.split(value).join(`[${name}]`);
  }
  return safe;
}
