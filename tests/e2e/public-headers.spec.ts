import { expect, test } from "./support/test";

// Security headers on every public page type and on the staff `/auth/*` pages (Phase 6 spec
// decision 1, Stream B's share of PR 6A step 2; ARCHITECTURE.md "Security"). The secure (checkout,
// account) and admin page types are covered by Stream A's header E2E. All of these pages are
// prerendered or static, so they get the nonce-free policy from next.config.ts (ADR-027), never a
// nonce, and never `unsafe-eval` (ADR-039: no tag manager). Each path asserts its exact status, so
// this file runs in the "status-codes" project on the fresh build (playwright.config.ts): after
// another spec refreshes a tag, Next.js 16.4 answers a re-rendered 404 or 308 with its 200 shell
// once (status-codes.spec.ts).

/** Each path with the status it must answer: the headers must be there on every outcome. */
const PUBLIC_PAGES: ReadonlyArray<readonly [string, number]> = [
  // Home, both languages.
  ["/", 200],
  ["/en", 200],
  // Tour listing and detail, site search (a query, so the listing's dynamic hole renders too).
  ["/tours", 200],
  ["/en/tours?scope=international", 200],
  ["/tours/du-thuyen-vinh-ha-long", 200],
  ["/en/tours/ha-long-bay-cruise", 200],
  ["/tim-kiem?q=ha%20long", 200],
  // Destinations, travel styles.
  ["/diem-den", 200],
  ["/diem-den/viet-nam", 200],
  ["/en/destinations/vietnam", 200],
  ["/phong-cach/trang-mat", 200],
  // Journal list, article, topic.
  ["/journal", 200],
  ["/journal/mot-ngay-tren-vinh-lan-ha", 200],
  ["/journal/chu-de/cam-hung", 200],
  // Static pages, policies, reviews, contact, the tailor-made wizard.
  ["/ve-chung-toi", 200],
  ["/cau-hoi-thuong-gap", 200],
  ["/chinh-sach/chinh-sach-bao-mat", 200],
  ["/en/policies/privacy-policy", 200],
  ["/danh-gia", 200],
  ["/lien-he", 200],
  ["/en/contact", 200],
  ["/thiet-ke-rieng", 200],
  // The newsletter's single-use pages (no token: their "invalid link" state).
  ["/ban-tin/xac-nhan", 200],
  ["/en/newsletter/unsubscribe", 200],
  // A real 404 and a real 308 (the other language's slug) carry the headers too.
  ["/en/does-not-exist", 404],
  ["/tours/ha-long-bay-cruise", 308],
];

const STAFF_AUTH_PAGES: ReadonlyArray<readonly [string, number]> = [
  ["/auth/login", 200],
  ["/auth/forgot-password", 200],
  ["/auth/update-password", 200],
  // Staff self sign-up is gone: a real 308 to the customer sign-up page (Phase 5 PR 5A).
  ["/auth/sign-up", 308],
];

/** At least one year, as browsers and the HSTS preload list require. */
const ONE_YEAR = 31_536_000;

const directive = (policy: string, name: string) =>
  policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `)) ?? "";

for (const [kind, paths] of [
  ["public pages", PUBLIC_PAGES],
  ["staff sign-in pages", STAFF_AUTH_PAGES],
] as const) {
  test(`${kind} carry the full header set with the nonce-free policy`, async ({ request }) => {
    for (const [path, status] of paths) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(status);
      if (status === 308) expect(response.headers()["location"], `${path} Location`).toBeTruthy();
      const all = response.headersArray();
      const policies = all.filter((header) => header.name.toLowerCase() === "content-security-policy");
      // Exactly one policy: next.config.ts sends it, the proxy adds none on these paths.
      expect(policies.length, path).toBe(1);
      const policy = policies[0]!.value;

      // CSP: nonce-free, no eval, framing and plugins off, scripts only from the listed hosts.
      expect(policy, path).not.toContain("nonce-");
      expect(policy, path).not.toContain("'unsafe-eval'");
      expect(policy, path).not.toContain("'strict-dynamic'");
      expect(directive(policy, "default-src"), path).toBe("default-src 'self'");
      expect(directive(policy, "object-src"), path).toBe("object-src 'none'");
      expect(directive(policy, "frame-ancestors"), path).toBe("frame-ancestors 'none'");
      expect(directive(policy, "base-uri"), path).toBe("base-uri 'self'");
      expect(directive(policy, "form-action"), path).toBe("form-action 'self'");
      expect(directive(policy, "frame-src"), path).toBe("frame-src https://challenges.cloudflare.com");
      const scripts = directive(policy, "script-src").split(" ").slice(1);
      expect(scripts.slice(0, 3), path).toEqual(["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"]);
      // With a GA4 measurement ID (CI builds with a fake one) only gtag.js's host is added
      // (ADR-039); never a wildcard, `data:` or another origin.
      const expectedExtra = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ? ["https://*.googletagmanager.com"] : [];
      expect(scripts.slice(3), path).toEqual(expectedExtra);

      // The baseline headers (src/lib/security-headers.ts).
      const headers = response.headers();
      const maxAge = Number(/^max-age=(\d+)/.exec(headers["strict-transport-security"] ?? "")?.[1]);
      expect(maxAge, `${path} HSTS`).toBeGreaterThanOrEqual(ONE_YEAR);
      expect(headers["x-frame-options"], path).toBe("DENY");
      expect(headers["x-content-type-options"], path).toBe("nosniff");
      expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      const permissions = headers["permissions-policy"] ?? "";
      for (const feature of ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()", "browsing-topics=()"]) {
        expect(permissions, `${path} Permissions-Policy`).toContain(feature);
      }
    }
  });
}
