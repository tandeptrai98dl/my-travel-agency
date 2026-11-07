import { pathnames } from "./pathnames";

/**
 * Client-safe localized paths for the public shell's client components. next-intl's client `Link`
 * and hooks need `NextIntlClientProvider`, whose message formatter adds about 12 KB gzip to the
 * initial JavaScript of every public page (Phase 3 spec decision 16). These helpers do the same
 * mapping from `pathnames` with no dependency; server code keeps using `@/i18n/navigation`, and a
 * unit test checks both give the same result for every route.
 */
export type Locale = "vi" | "en";

type Internal = keyof typeof pathnames;
type StaticPath = { [K in Internal]: K extends `${string}[${string}` ? never : K }[Internal];
type DynamicPath = Exclude<Internal, StaticPath>;
type Query = Record<string, string>;

export type LocalizedHref =
  | StaticPath
  | { pathname: StaticPath; query?: Query }
  | { pathname: DynamicPath; params: Record<string, string>; query?: Query };

const DEFAULT_LOCALE: Locale = "vi";

function template(pathname: string, locale: Locale): string {
  const entry = (pathnames as Record<string, string | Record<Locale, string>>)[pathname];
  if (entry === undefined) return pathname;
  return typeof entry === "string" ? entry : entry[locale];
}

function withPrefix(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** The public URL of an internal route in one language (same result as next-intl's getPathname). */
export function localizedPath(locale: Locale, href: LocalizedHref | { pathname: string; params?: Record<string, string>; query?: Query }): string {
  const { pathname, params, query } =
    typeof href === "string" ? { pathname: href, params: undefined, query: undefined } : { params: undefined, ...href };
  const filled = template(pathname, locale).replace(/\[([^\]]+)\]/g, (_, name: string) => {
    const value = params?.[name];
    return value === undefined ? `[${name}]` : encodeURIComponent(value);
  });
  const search = query && Object.keys(query).length > 0 ? `?${new URLSearchParams(query).toString()}` : "";
  return withPrefix(filled, locale) + search;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|\\]/g, "\\$&");
}

/** Splits a browser pathname into its locale and the path without the locale prefix. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  if (pathname === "/en" || pathname.startsWith("/en/")) return { locale: "en", path: pathname.slice(3) || "/" };
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/**
 * The internal route and params of a public path in a given language (the inverse of
 * `localizedPath`); an unknown path is returned as is, with no params.
 */
export function internalRoute(locale: Locale, path: string): { pathname: string; params: Record<string, string> } {
  return matchRoute(path, (internal) => template(internal, locale));
}

function matchRoute(path: string, toTemplate: (internal: string) => string): { pathname: string; params: Record<string, string> } {
  for (const internal of Object.keys(pathnames)) {
    const names: string[] = [];
    const pattern = toTemplate(internal)
      .split(/(\[[^\]]+\])/)
      .map((part) => {
        const match = /^\[([^\]]+)\]$/.exec(part);
        if (!match) return escapeRegExp(part);
        names.push(match[1]);
        return "([^/]+)";
      })
      .join("");
    const found = new RegExp(`^${pattern}/?$`).exec(path);
    if (!found) continue;
    const params: Record<string, string> = {};
    names.forEach((name, index) => {
      const raw = found[index + 1];
      try {
        params[name] = decodeURIComponent(raw);
      } catch {
        params[name] = raw;
      }
    });
    return { pathname: internal, params };
  }
  return { pathname: path, params: {} };
}

/**
 * The language and internal route of a browser pathname. While a Vietnamese page is prerendered,
 * `usePathname()` gives the proxy's internal path (`/vi/contact`, `/vi/tours/<slug>`), whose
 * segments are the internal route names; no public Vietnamese path starts with `/vi`.
 */
export function currentRoute(pathname: string): { locale: Locale; pathname: string; params: Record<string, string> } {
  if (pathname === "/vi" || pathname.startsWith("/vi/")) return { locale: "vi", ...matchRoute(pathname.slice(3) || "/", (internal) => internal) };
  const { locale, path } = splitLocale(pathname);
  return { locale, ...internalRoute(locale, path) };
}

/** The same page in another language, for a browser pathname (language switcher fallback). */
export function switchLocalePath(pathname: string, target: Locale): string {
  const { pathname: route, params } = currentRoute(pathname);
  return localizedPath(target, { pathname: route, params });
}
