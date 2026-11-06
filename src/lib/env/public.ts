/**
 * Public environment values, safe to import from client components.
 *
 * Each variable is referenced literally so Next.js inlines it at build time.
 * No validation library is loaded here, to keep client bundles small; the
 * values are validated on the server at startup (see `./server.ts` and
 * `src/instrumentation.ts`), so a misconfigured deployment fails before
 * serving any page.
 */
export const publicEnv = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
} as const;
