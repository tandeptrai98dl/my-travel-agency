import { localizedPath, type Locale } from "../../i18n/paths";
import { safeRedirectPath } from "../safe-redirect";

/**
 * The proxy's fast path for signed-out visitors of the account pages (docs/QA_REPORT.md, "Items
 * for Stream A"): a real HTTP redirect to sign-in instead of a streamed page that redirects on the
 * client. It looks only at whether a Supabase session cookie is present, never at what it holds;
 * the account pages still verify the user themselves (`requireCustomer()`, `getClaims()`), so a
 * stale or forged cookie only skips this shortcut.
 */

const LOCALES: Locale[] = ["vi", "en"];

/** `/tai-khoan` and `/en/account`, with everything below them, from `pathnames`. */
const ACCOUNT_ROOTS = LOCALES.map((locale) => ({ locale, root: localizedPath(locale, "/account") }));

/**
 * Supabase Auth's session cookie (`@supabase/ssr`): `sb-<project ref>-auth-token`, split into
 * `.0`, `.1`… chunks when large. The PKCE `-code-verifier` cookie is not a session.
 */
const SESSION_COOKIE = /^sb-[^.]+-auth-token(?:\.\d+)?$/;

export function hasSessionCookie(cookies: readonly { name: string; value: string }[]): boolean {
  return cookies.some((cookie) => cookie.value !== "" && SESSION_COOKIE.test(cookie.name));
}

/** The account root a browser path belongs to, or null for any other path. */
export function accountLocale(pathname: string): Locale | null {
  const found = ACCOUNT_ROOTS.find(({ root }) => pathname === root || pathname.startsWith(`${root}/`));
  return found?.locale ?? null;
}

/**
 * The sign-in URL (`/dang-nhap?next=…`, `/en/login?next=…`) for a signed-out request to an account
 * page, or null when the request is not for an account page or carries a session cookie. `next` is
 * the requested path and query, kept only when `safeRedirectPath()` accepts it (otherwise the
 * account root), as the sign-in page checks it again.
 */
export function signedOutAccountRedirect(
  pathname: string,
  search: string,
  cookies: readonly { name: string; value: string }[],
): string | null {
  const locale = accountLocale(pathname);
  if (!locale || hasSessionCookie(cookies)) return null;
  const root = localizedPath(locale, "/account");
  // The sign-in page keeps at most 500 characters of `next`; a longer query is dropped.
  const requested = `${pathname}${search}`.length <= 500 ? `${pathname}${search}` : pathname;
  const next = safeRedirectPath(requested, root);
  return `${localizedPath(locale, "/login")}?next=${encodeURIComponent(next)}`;
}
