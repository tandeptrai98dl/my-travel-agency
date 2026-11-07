import type { APIResponse } from "@playwright/test";

import { expect, test } from "./support/test";

// Phase 6 PR 6A (docs/specs/phase-6-hardening-launch.md decision 1, "Headers"): the full header set
// on the secure root (checkout, account, customer sign-in), the admin and the API routes. Public
// pages and /auth/* are Stream B's (public-headers spec); csp.spec.ts covers nonce rotation and
// the scripts under each policy.

const BASELINE: Record<string, string> = {
  // Two years, without includeSubDomains/preload until the production domain serves every
  // subdomain over HTTPS (decision 1, owner item 1; docs/SECURITY_REVIEW.md "Headers").
  "strict-transport-security": "max-age=63072000",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
};

function expectBaseline(response: APIResponse, path: string) {
  const headers = response.headers();
  for (const [name, value] of Object.entries(BASELINE)) expect(headers[name], `${path} ${name}`).toBe(value);
  expect(headers["x-powered-by"], `${path} x-powered-by`).toBeUndefined();
}

/** The directives of a policy, by name. */
function directives(policy: string): Map<string, string> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name!, values.join(" ")] as const;
      }),
  );
}

const NONCE_SCRIPTS = /^'self' 'nonce-[A-Za-z0-9+/=]{16,}' 'strict-dynamic'$/;
// With a GA4 measurement ID, book and checkout (and only they) also allow gtag.js's host
// (ADR-039, isAnalyticsSecurePath(); Stream B's analytics-csp.spec.ts checks which routes).
const NONCE_SCRIPTS_WITH_GA = /^'self' 'nonce-[A-Za-z0-9+/=]{16,}' 'strict-dynamic'( https:\/\/\*\.googletagmanager\.com)?$/;

function expectNoncePolicy(response: APIResponse, path: string, formAction: RegExp, scripts = NONCE_SCRIPTS) {
  const policy = directives(response.headers()["content-security-policy"] ?? "");
  expect(policy.get("default-src"), path).toBe("'self'");
  expect(policy.get("script-src"), path).toMatch(scripts);
  expect(policy.get("object-src"), path).toBe("'none'");
  expect(policy.get("base-uri"), path).toBe("'none'");
  expect(policy.get("frame-ancestors"), path).toBe("'none'");
  expect(policy.get("form-action"), path).toMatch(formAction);
  // Session-dependent pages are never stored by a browser or a shared cache.
  expect(response.headers()["cache-control"], path).toContain("no-store");
}

test("secure pages (checkout, account, customer sign-in) send the baseline and a nonce policy", async ({ request }) => {
  const paths = [
    ["/dang-nhap", NONCE_SCRIPTS],
    ["/en/login", NONCE_SCRIPTS],
    ["/tai-khoan", NONCE_SCRIPTS],
    ["/en/account/bookings", NONCE_SCRIPTS],
    ["/thanh-toan/PTA-0000-0000", NONCE_SCRIPTS_WITH_GA],
    ["/en/checkout/PTA-0000-0000/result", NONCE_SCRIPTS_WITH_GA],
  ] as const;
  for (const [path, scripts] of paths) {
    const response = await request.get(path, { maxRedirects: 0 });
    expectBaseline(response, path);
    // Checkout may post to VNPay's payment page (the method form); nothing else.
    expectNoncePolicy(response, path, /^'self'( https:\/\/(sandbox\.vnpayment\.vn|pay\.vnpay\.vn))?$/, scripts);
  }
});

test("admin pages send the baseline, a nonce policy without frames, and noindex", async ({ request }) => {
  for (const path of ["/admin", "/admin/mfa", "/admin/bookings", "/admin/settings"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expectBaseline(response, path);
    expectNoncePolicy(response, path, /^'self'$/);
    expect(directives(response.headers()["content-security-policy"] ?? "").get("frame-src"), path).toBe("'none'");
    expect(await response.text(), path).toContain('<meta name="robots" content="noindex, nofollow"/>');
  }
});

test("API routes send the baseline, no page policy and no-store", async ({ request }) => {
  const calls: [string, () => Promise<APIResponse>][] = [
    ["GET /api/health", () => request.get("/api/health")],
    ["GET /api/payments/vnpay/ipn", () => request.get("/api/payments/vnpay/ipn?vnp_TxnRef=PTA000000000001")],
    ["POST /api/webhooks/bank-transfer", () => request.post("/api/webhooks/bank-transfer", { data: {} })],
    ["GET /api/cron/health-checks", () => request.get("/api/cron/health-checks")],
  ];
  for (const [label, call] of calls) {
    const response = await call();
    expectBaseline(response, label);
    expect(response.headers()["content-security-policy"], label).toBeUndefined();
    expect(response.headers()["cache-control"], label).toContain("no-store");
    expect(response.headers()["content-type"], label).toContain("application/json");
  }
});
