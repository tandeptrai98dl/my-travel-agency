import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { securityHeaders } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // Source maps are uploaded only when these are set (Vercel builds); elsewhere nothing is sent.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  // Browser tracing is off (sentry-options.ts), so navigation hooks are not needed.
  suppressOnRouterTransitionStartWarning: true,
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
