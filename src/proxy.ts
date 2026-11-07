import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";
import { adminCsp, createNonce, isAdminPath, isSecurePath, secureCsp } from "@/lib/csp";
import { createRedirectLookup } from "@/lib/redirect-lookup";
import { isSitePath } from "@/lib/site-path";
import { refreshSession } from "@/lib/supabase/proxy";

const handleLocale = createIntlMiddleware(routing);

/** Paths outside the localized website: no locale prefix or rewrite. */
const NON_LOCALIZED = /^\/(?:admin|api|auth)(?:\/|$)/;
/**
 * Generated metadata images (`opengraph-image.tsx`, Phase 3 spec decision 11). Next.js links them
 * with the internal locale segment (`/vi/opengraph-image-…`), which the locale handler would
 * redirect; they are public, cookie-free files, so they skip the proxy entirely.
 */
const METADATA_IMAGE = /^\/(?:vi|en)(?:\/[^/]+)*\/(?:opengraph|twitter)-image(?:-[\w-]+)?$/;

const log = (event: string, fields?: Record<string, string | number>) =>
  console.warn(JSON.stringify({ level: "warn", event, time: new Date().toISOString(), ...fields }));

/**
 * Redirects saved in the admin, read from Upstash Redis (Phase 3 spec decision 14). Without its
 * two variables there is no lookup at all (logged once per instance).
 */
const lookupRedirect = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    log("redirects.disabled", { reason: "UPSTASH_REDIS_REST_URL and _TOKEN are not set" });
    return null;
  }
  return createRedirectLookup({ url, token, log });
})();

/**
 * Next.js proxy: redirects from Redis, Supabase session refresh, CSP nonces and locale routing.
 * Security headers and the public CSP are set for every path in next.config.ts.
 * Not an authentication layer (ARCHITECTURE.md "Auth"): protected pages check the user
 * themselves.
 */
export async function proxy(request: NextRequest) {
  if (METADATA_IMAGE.test(request.nextUrl.pathname)) return NextResponse.next();

  // 0. A redirect saved in the admin, or the other language's slug of a page (written on content
  // saves), for public page requests only. The target is used exactly
  // as stored (already checked by the lookup) and must stay on this site.
  const { pathname } = request.nextUrl;
  if (
    lookupRedirect &&
    (request.method === "GET" || request.method === "HEAD") &&
    // Only paths that could be a saved source, so arbitrary request paths neither fill the cache
    // nor cost Upstash commands (#40 review).
    isSitePath(pathname, { source: true }) &&
    !NON_LOCALIZED.test(pathname) &&
    !isSecurePath(pathname)
  ) {
    const found = await lookupRedirect(pathname);
    if (found) {
      const target = new URL(found.to, request.nextUrl.origin);
      if (target.origin === request.nextUrl.origin) return NextResponse.redirect(target, found.status);
    }
  }

  // 1. Refresh the session first, so the locale handler forwards the refreshed cookies.
  const session = await refreshSession(request);

  // 2. Checkout, account and the admin (ADR-027 option 2): a per-request nonce. Next.js reads it
  // from the request's CSP header and puts it on every script of these fully dynamic pages. The
  // public pages get their nonce-free policy from next.config.ts.
  const hosts = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    development: process.env.NODE_ENV === "development",
  };
  let policy: string | null = null;
  if (isSecurePath(pathname)) {
    policy = secureCsp({
      ...hosts,
      nonce: createNonce(),
      paymentUrl: process.env.VNPAY_PAYMENT_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    });
  } else if (isAdminPath(pathname)) {
    policy = adminCsp({ ...hosts, nonce: createNonce() });
  }
  if (policy) request.headers.set("Content-Security-Policy", policy);

  // 3. Locale routing for the public website; everything else passes through.
  const response = NON_LOCALIZED.test(pathname)
    ? NextResponse.next({ request })
    : handleLocale(request);
  if (policy) response.headers.set("Content-Security-Policy", policy);

  // 4. Hand the refreshed cookies (and their no-store cache headers) to the browser.
  for (const { name, value, options } of session.cookies) {
    response.cookies.set(name, value, options);
  }
  for (const [name, value] of Object.entries(session.headers)) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  // Everything except Next.js internals and files with an extension (images, fonts, robots.txt…).
  matcher: ["/((?!_next/|_vercel/|.*\\..*).*)"],
};
