import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";
import { adminCsp, createNonce, isAdminPath, isSecurePath, secureCsp } from "@/lib/csp";
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

/**
 * Next.js proxy: Supabase session refresh and locale routing. Security headers are set for every
 * path in next.config.ts.
 * Not an authentication layer (ARCHITECTURE.md "Auth"): protected pages check the user
 * themselves. Redirects from Redis are added in Phase 2.
 */
export async function proxy(request: NextRequest) {
  if (METADATA_IMAGE.test(request.nextUrl.pathname)) return NextResponse.next();

  // 1. Refresh the session first, so the locale handler forwards the refreshed cookies.
  const session = await refreshSession(request);

  // 2. Checkout, account and the admin (ADR-027 option 2): a per-request nonce. Next.js reads it
  // from the request's CSP header and puts it on every script of these fully dynamic pages. The
  // public pages get their nonce-free policy from next.config.ts.
  const { pathname } = request.nextUrl;
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
