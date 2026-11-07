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

/**
 * Localized paths the secure root serves (src/i18n/pathnames.ts), in both languages. Only these:
 * a prefix the root does not serve yet would be answered by the public root, whose prerendered
 * scripts have no nonce. The account (`/tai-khoan`, `/en/account`) is added with its pages.
 */
const SECURE_PATH = /^\/(?:dat-tour\/|thanh-toan\/|en\/book\/|en\/checkout\/|en\/pay\/)/;

export function isSecurePath(pathname: string): boolean {
  return SECURE_PATH.test(pathname);
}

/** The admin (`src/app/admin`, fully dynamic with a nonce). */
export function isAdminPath(pathname: string): boolean {
  return /^\/admin(?:\/|$)/.test(pathname);
}

/**
 * Paths that get the public nonce-free policy from next.config.ts (a path-to-regexp source):
 * everything except the admin, the API and the secure paths above, which the proxy covers or
 * which serve no pages. Kept in step with SECURE_PATH by a unit test.
 */
export const PUBLIC_CSP_SOURCE = "/((?!admin/|admin$|api/|dat-tour/|thanh-toan/|en/book/|en/checkout/|en/pay/).*)";

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
  return build(
    [
      ["default-src", "'self'"],
      ["script-src", "'self'", "'unsafe-inline'", TURNSTILE, ...(options.development ? ["'unsafe-eval'"] : [])],
      ["style-src", "'self'", "'unsafe-inline'"],
      ["img-src", "'self'", "data:", "blob:", ...(supabase ? [supabase] : [])],
      ["font-src", "'self'"],
      ["connect-src", "'self'", ...list(TURNSTILE)],
      ["frame-src", TURNSTILE],
      ["form-action", "'self'"],
      ["base-uri", "'self'"],
      ["object-src", "'none'"],
      ["frame-ancestors", "'none'"],
    ],
    supabase,
  );
}

/** Checkout and account: nonce'd scripts, Turnstile, and VNPay's payment page as a form target. */
export function secureCsp({ nonce, paymentUrl, ...options }: NonceOptions & { paymentUrl?: string }): string {
  const { supabase, list } = hosts(options);
  const vnpay = origin(paymentUrl);
  return build(
    [
      ["default-src", "'self'"],
      ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(options.development ? ["'unsafe-eval'"] : [])],
      ["style-src", "'self'", "'unsafe-inline'"],
      ["img-src", "'self'", "data:", "blob:", ...(supabase ? [supabase] : [])],
      ["font-src", "'self'"],
      ["connect-src", "'self'", ...list(TURNSTILE)],
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
