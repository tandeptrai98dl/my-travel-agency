/**
 * Baseline security headers for every response (ARCHITECTURE.md "Security"), applied in
 * next.config.ts so static files and paths the proxy skips get them too. CSP is added per page
 * type in Phase 3.
 *
 * HSTS: two years, without includeSubDomains/preload until the production domain is decided
 * (PROJECT_BRIEF.md §9); add them in the Phase 6 launch checklist.
 */
export const securityHeaders: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];
