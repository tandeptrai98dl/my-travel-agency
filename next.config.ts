import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { PUBLIC_CSP_SOURCE, publicCsp } from "./src/lib/csp";
import { securityHeaders } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
  // ADR-021: Partial Prefetching alongside Cache Components, as Next.js recommends.
  partialPrefetching: true,
  async headers() {
    // Public pages and /auth (ADR-027): a static nonce-free policy; checkout, account and the
    // admin get a nonce policy from src/proxy.ts instead.
    const csp = publicCsp({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      gaMeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
      development: process.env.NODE_ENV === "development",
    });
    return [
      { source: "/:path*", headers: [...securityHeaders] },
      { source: PUBLIC_CSP_SOURCE, headers: [{ key: "Content-Security-Policy", value: csp }] },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // Source maps are uploaded only when these are set (Vercel builds); elsewhere nothing is sent.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // Release tracking: one release per Vercel build, named after its commit (the same value
  // sentryOptions() reads at run time); created, with its source maps, only when a token is set.
  release: {
    name: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    create: Boolean(process.env.SENTRY_AUTH_TOKEN),
  },
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  // Browser tracing is off (sentry-options.ts), so navigation hooks are not needed.
  suppressOnRouterTransitionStartWarning: true,
  // No route manifest in the browser bundle: it only names spans after route patterns (tracing is
  // off), it listed every route, admin included, in every public page's initial JavaScript
  // (≈ 0.8 KB gzip, growing with each route), and beforeSend already redacts transaction paths.
  routeManifestInjection: false,
  // Smaller browser bundle: no debug statements, tracing or Session Replay code (none are used).
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    // Errors only (sentry-options.ts): leave the tracing code out of the bundle.
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
});
