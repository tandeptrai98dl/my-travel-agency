import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";
import { applySecurityHeaders } from "@/lib/security-headers";
import { refreshSession } from "@/lib/supabase/proxy";

const handleLocale = createIntlMiddleware(routing);

/** Paths outside the localized website: no locale prefix or rewrite. */
const NON_LOCALIZED = /^\/(?:admin|api|auth)(?:\/|$)/;

/**
 * Next.js proxy: Supabase session refresh, locale routing and security headers.
 * Not an authentication layer (ARCHITECTURE.md "Auth"): protected pages check the user
 * themselves. Redirects from Redis are added in Phase 2.
 */
export async function proxy(request: NextRequest) {
  // 1. Refresh the session first, so the locale handler forwards the refreshed cookies.
  const session = await refreshSession(request);

  // 2. Locale routing for the public website; everything else passes through.
  const response = NON_LOCALIZED.test(request.nextUrl.pathname)
    ? NextResponse.next({ request })
    : handleLocale(request);

  // 3. Hand the refreshed cookies (and their no-store cache headers) to the browser.
  for (const { name, value, options } of session.cookies) {
    response.cookies.set(name, value, options);
  }
  for (const [name, value] of Object.entries(session.headers)) {
    response.headers.set(name, value);
  }

  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  // Everything except Next.js internals and files with an extension (images, fonts, robots.txt…).
  matcher: ["/((?!_next/|_vercel/|.*\\..*).*)"],
};
