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

/** The longest `next` the sign-in page keeps (`login/page.tsx` slices it to 500 characters). */
const MAX_NEXT = 500;

/** `/tai-khoan` and `/en/account`, with everything below them, from `pathnames`. */
const ACCOUNT_ROOTS = LOCALES.map((locale) => ({ locale, root: localizedPath(locale, "/account") }));

/**
 * The name of this project's Supabase Auth session cookie, as `@supabase/ssr` derives it from the
 * project URL: `sb-<first label of the host>-auth-token` (`sb-abcd…-auth-token` on supabase.co,
 * `sb-127-auth-token` locally). Only this project's cookie counts: a leftover cookie from another
 * project (after a migration, or localhost against 127.0.0.1) is never cleared by the session
 * refresh and would otherwise switch the fast path off for good.
 */
export function sessionCookieName(supabaseUrl: string): string | null {
  try {
    return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}

/**
 * Whether this project's session cookie is present: the cookie itself or its `.0`, `.1`… chunks
 * (written when large), with a value. The PKCE `-code-verifier` cookie is not a session; an empty
 * value is a cookie the session refresh has just removed.
 */
export function hasSessionCookie(cookies: readonly { name: string; value: string }[], cookieName: string): boolean {
  const chunk = (name: string) => name.startsWith(`${cookieName}.`) && /^\d+$/.test(name.slice(cookieName.length + 1));
  return cookies.some((cookie) => cookie.value !== "" && (cookie.name === cookieName || chunk(cookie.name)));
}

/** The account root a browser path belongs to, or null for any other path. */
export function accountLocale(pathname: string): Locale | null {
  const found = ACCOUNT_ROOTS.find(({ root }) => pathname === root || pathname.startsWith(`${root}/`));
  return found?.locale ?? null;
}

/**
 * The sign-in URL (`/dang-nhap?next=…`, `/en/login?next=…`) for a signed-out request to an account
 * page, or null when the request is not for an account page or carries this project's session
 * cookie (`cookieName`, from `sessionCookieName()`). `next` is the requested path and query, kept
 * only when `safeRedirectPath()` accepts it (otherwise the account root), as the sign-in page
 * checks it again.
 */
export function signedOutAccountRedirect(
  pathname: string,
  search: string,
  cookies: readonly { name: string; value: string }[],
  cookieName: string,
): string | null {
  const locale = accountLocale(pathname);
  if (!locale || hasSessionCookie(cookies, cookieName)) return null;
  const root = localizedPath(locale, "/account");
  // The sign-in page keeps at most 500 characters of `next`: a longer query is dropped, and a
  // longer path falls back to the account root.
  const full = `${pathname}${search}`;
  const requested = full.length <= MAX_NEXT ? full : pathname.length <= MAX_NEXT ? pathname : root;
  const next = safeRedirectPath(requested, root);
  return `${localizedPath(locale, "/login")}?next=${encodeURIComponent(next)}`;
}
