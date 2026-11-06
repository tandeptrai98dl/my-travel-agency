/**
 * Baseline security headers for every response that passes through the proxy
 * (ARCHITECTURE.md "Security"). CSP is added per page type in Phase 3.
 */
export const securityHeaders: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
};

export function applySecurityHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
}
