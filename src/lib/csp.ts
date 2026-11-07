/**
 * Content Security Policy of the checkout and account pages (ADR-027 option 2,
 * docs/specs/phase-4-booking-payments.md decision 12). Those pages render fully dynamically under
 * `src/app/(secure)`, so every script Next.js writes can carry the per-request nonce the proxy
 * puts here; `'strict-dynamic'` lets those scripts load their own chunks (and Turnstile).
 * The cached public pages get their own nonce-free policy (Phase 3 PR M).
 */

/** Localized checkout and account paths (src/i18n/pathnames.ts), in both languages. */
const SECURE_PATH = /^\/(?:en\/)?(?:dat-tour|thanh-toan|tai-khoan|book|checkout|pay|account)(?:\/|$)/;

export function isSecurePath(pathname: string): boolean {
  return SECURE_PATH.test(pathname);
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

type Options = {
  nonce: string;
  /** NEXT_PUBLIC_SUPABASE_URL: images and the browser client. */
  supabaseUrl: string;
  /** VNPay's payment page: a form that posts there may be redirected to it. */
  paymentUrl?: string;
  /** React needs eval in development only. */
  development?: boolean;
};

const origin = (value: string | undefined) => {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
};

export function secureCsp({ nonce, supabaseUrl, paymentUrl, development = false }: Options): string {
  const supabase = origin(supabaseUrl);
  const vnpay = origin(paymentUrl);
  const turnstile = "https://challenges.cloudflare.com";
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(development ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:", ...(supabase ? [supabase] : [])],
    ["font-src", "'self'"],
    ["connect-src", "'self'", ...(supabase ? [supabase] : []), turnstile],
    ["frame-src", turnstile],
    ["form-action", "'self'", ...(vnpay ? [vnpay] : [])],
    ["base-uri", "'none'"],
    ["object-src", "'none'"],
    ["frame-ancestors", "'none'"],
  ];
  if (supabase?.startsWith("https:")) directives.push(["upgrade-insecure-requests"]);
  return directives.map((parts) => parts.join(" ")).join("; ");
}
