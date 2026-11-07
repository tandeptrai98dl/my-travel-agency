/**
 * Content Security Policies per page type (ADR-027, Phase 3 spec decision 13):
 * - public pages and `/auth/*`: prerendered, so a static nonce-free policy (`publicCsp`, sent from
 *   next.config.ts for every path outside admin, the API and checkout);
 * - checkout and account (`src/app/(secure)`) and the admin (`src/app/admin`): rendered fully
 *   dynamically, so every script Next.js writes can carry the per-request nonce the proxy puts
 *   here (`secureCsp`, `adminCsp`); `'strict-dynamic'` lets those scripts load their own chunks
 *   (and Turnstile).
 * Hosts come from the validated public env (Supabase, Sentry ingest), never hard-coded.
 */

import { localizedPath, type Locale } from "../i18n/paths";
import type { pathnames } from "../i18n/pathnames";

/**
 * Routes the secure root serves (`src/app/(secure)/[locale]`, keys of src/i18n/pathnames.ts). This
 * one list gives both the proxy's nonce paths (`isSecurePath`) and the paths excluded from the
 * public nonce-free policy (`PUBLIC_CSP_SOURCE`), in both languages, so they cannot drift. Only
 * routes the secure root really serves: any other path is answered by the public root, whose
 * prerendered scripts have no nonce.
 */
export const SECURE_ROUTES = [
  "/book/[tourSlug]",
  "/checkout/[code]",
  "/pay/[token]",
  // Phase 5 PR 5A: the customer sign-in pages and the account (the page and everything below it).
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/account",
  // Phase 5 PR 5B: the guest booking lookup.
  "/booking-lookup",
] as const satisfies readonly (keyof typeof pathnames)[];

const LOCALES: Locale[] = ["vi", "en"];

/**
 * Each secure route as regex alternatives without the leading "/": a route with parameters covers
 * everything under its static prefix (`dat-tour/`), one without covers itself and below
 * (`tai-khoan$`, `tai-khoan/`). Plain alternatives, so path-to-regexp accepts them too.
 */
export function secureAlternatives(routes: readonly (keyof typeof pathnames)[] = SECURE_ROUTES): string[] {
  const parts = new Set<string>();
  for (const route of routes) {
    for (const locale of LOCALES) {
      const path = localizedPath(locale, { pathname: route, params: {} } as Parameters<typeof localizedPath>[1]).slice(1);
      const bracket = path.indexOf("[");
      if (bracket >= 0) parts.add(path.slice(0, bracket).replace(/[.*+?^${}()|\\]/g, "\\$&"));
      else {
        const escaped = path.replace(/[.*+?^${}()|\\]/g, "\\$&");
        parts.add(`${escaped}$`);
        parts.add(`${escaped}/`);
      }
    }
  }
  return [...parts];
}

const SECURE_ALTERNATIVES = secureAlternatives();
const SECURE_PATH = new RegExp(`^/(?:${SECURE_ALTERNATIVES.join("|")})`);

export function isSecurePath(pathname: string): boolean {
  return SECURE_PATH.test(pathname);
}

/** The admin (`src/app/admin`, fully dynamic with a nonce). */
export function isAdminPath(pathname: string): boolean {
  return /^\/admin(?:\/|$)/.test(pathname);
}

/**
 * Paths that get the public nonce-free policy from next.config.ts (a path-to-regexp source):
 * everything except the admin, the API and the secure routes, which the proxy covers or which
 * serve no pages.
 */
export const PUBLIC_CSP_SOURCE = `/((?!${["admin/", "admin$", "api/", ...SECURE_ALTERNATIVES].join("|")}).*)`;

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

type Hosts = {
  /** NEXT_PUBLIC_SUPABASE_URL: images, the browser client, signed uploads. */
  supabaseUrl: string;
  /** NEXT_PUBLIC_SENTRY_DSN: the browser SDK sends errors to its ingest host. */
  sentryDsn?: string;
  /** NEXT_PUBLIC_GA_MEASUREMENT_ID: with it, gtag.js and its hosts are allowed (ADR-039). */
  gaMeasurementId?: string;
  /** React needs eval in development only. */
  development?: boolean;
};

type NonceOptions = Hosts & { nonce: string };

const origin = (value: string | undefined) => {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
};

const TURNSTILE = "https://challenges.cloudflare.com";

/**
 * Google Analytics 4 through gtag.js, never Google Tag Manager (ADR-039): the script from the Tag
 * Manager host, collection requests and pixels to the Analytics hosts. Only when a measurement ID
 * is configured; without one nothing of Google's is allowed.
 */
const GA_SCRIPT_HOSTS = ["https://*.googletagmanager.com"];
const GA_HOSTS = ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com"];
const ga = (options: Hosts) => (options.gaMeasurementId ? { script: GA_SCRIPT_HOSTS, hosts: GA_HOSTS } : { script: [], hosts: [] });

type Directive = [string, ...string[]];

function build(directives: Directive[], supabase: string | null): string {
  // Only when Supabase is served over https: a local http://127.0.0.1 Supabase would otherwise be
  // rewritten to https and fail.
  if (supabase?.startsWith("https:")) directives.push(["upgrade-insecure-requests"]);
  return directives.map((parts) => parts.join(" ")).join("; ");
}

function hosts({ supabaseUrl, sentryDsn }: Hosts) {
  const supabase = origin(supabaseUrl);
  const sentry = origin(sentryDsn);
  return { supabase, list: (...extra: (string | null)[]) => [supabase, sentry, ...extra].filter((value): value is string => Boolean(value)) };
}

/**
 * Public pages and `/auth/*`: prerendered, so Next.js's inline bootstrap scripts cannot carry a
 * nonce (`'unsafe-inline'`). Turnstile loads its script and frame on the contact and newsletter
 * forms (ADR-029).
 */
export function publicCsp(options: Hosts): string {
  const { supabase, list } = hosts(options);
  const analytics = ga(options);
  return build(
    [
      ["default-src", "'self'"],
      ["script-src", "'self'", "'unsafe-inline'", TURNSTILE, ...analytics.script, ...(options.development ? ["'unsafe-eval'"] : [])],
      ["style-src", "'self'", "'unsafe-inline'"],
      ["img-src", "'self'", "data:", "blob:", ...(supabase ? [supabase] : []), ...analytics.hosts],
      ["font-src", "'self'"],
      ["connect-src", "'self'", ...list(TURNSTILE), ...analytics.hosts],
      ["frame-src", TURNSTILE],
      ["form-action", "'self'"],
      ["base-uri", "'self'"],
      ["object-src", "'none'"],
      ["frame-ancestors", "'none'"],
    ],
    supabase,
  );
}

/**
 * Checkout and account: nonce'd scripts, Turnstile, and VNPay's payment page as a form target.
 * gtag.js is loaded with the request nonce on the pages that may use it (book, checkout, result);
 * its host stays in `script-src` for browsers without `'strict-dynamic'`.
 */
export function secureCsp({ nonce, paymentUrl, ...options }: NonceOptions & { paymentUrl?: string }): string {
  const { supabase, list } = hosts(options);
  const vnpay = origin(paymentUrl);
  const analytics = ga(options);
  return build(
    [
      ["default-src", "'self'"],
      ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...analytics.script, ...(options.development ? ["'unsafe-eval'"] : [])],
      ["style-src", "'self'", "'unsafe-inline'"],
      ["img-src", "'self'", "data:", "blob:", ...(supabase ? [supabase] : []), ...analytics.hosts],
      ["font-src", "'self'"],
      ["connect-src", "'self'", ...list(TURNSTILE), ...analytics.hosts],
      ["frame-src", TURNSTILE],
      ["form-action", "'self'", ...(vnpay ? [vnpay] : [])],
      ["base-uri", "'none'"],
      ["object-src", "'none'"],
      ["frame-ancestors", "'none'"],
    ],
    supabase,
  );
}

/** The admin: nonce'd scripts; Supabase for the browser client and signed Storage uploads. */
export function adminCsp({ nonce, ...options }: NonceOptions): string {
  const { supabase, list } = hosts(options);
  return build(
    [
      ["default-src", "'self'"],
      ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(options.development ? ["'unsafe-eval'"] : [])],
      ["style-src", "'self'", "'unsafe-inline'"],
      ["img-src", "'self'", "data:", "blob:", ...(supabase ? [supabase] : [])],
      ["font-src", "'self'"],
      ["connect-src", "'self'", ...list()],
      ["frame-src", "'none'"],
      ["form-action", "'self'"],
      ["base-uri", "'none'"],
      ["object-src", "'none'"],
      ["frame-ancestors", "'none'"],
    ],
    supabase,
  );
}
