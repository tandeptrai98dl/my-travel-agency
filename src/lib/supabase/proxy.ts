import { type CookieOptions, createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

import { publicEnv } from "@/lib/env/public";

export type SessionRefresh = {
  cookies: { name: string; value: string; options: CookieOptions }[];
  /** Cache headers that must accompany the cookies so no CDN caches a session. */
  headers: Record<string, string>;
};

/**
 * Refreshes the Supabase session cookie for this request.
 *
 * Updated cookies are written onto the incoming request (so Server Components rendered for this
 * request see the fresh session) and returned so the proxy can copy them, with the cache
 * headers, onto whatever response it builds.
 *
 * This is session upkeep only. It never redirects and is never the authentication check:
 * layouts, Server Actions and Route Handlers verify the user themselves (requireRole()).
 */
export async function refreshSession(request: NextRequest): Promise<SessionRefresh> {
  const refresh: SessionRefresh = { cookies: [], headers: {} };

  // With Fluid compute, never keep this client in a global; create one per request.
  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          refresh.cookies.push(...cookiesToSet);
          Object.assign(refresh.headers, headers);
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(): getClaims() is what refreshes
  // an expired access token.
  await supabase.auth.getClaims();

  return refresh;
}
