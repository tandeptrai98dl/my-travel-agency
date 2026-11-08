import { expect, test } from "./support/test";

// Security headers on every public page type and on the staff `/auth/*` pages (Phase 6 spec
// decision 1, Stream B's share of PR 6A step 2; ARCHITECTURE.md "Security"). The secure (checkout,
// account) and admin page types are covered by Stream A's header E2E. All of these pages are
// prerendered or static, so they get the nonce-free policy from next.config.ts (ADR-027), never a
// nonce, and never `unsafe-eval` (ADR-039: no tag manager). Each path asserts its exact status, so
// this file runs in the "status-codes" project on the fresh build (playwright.config.ts). After
// another spec refreshes a tag, Next.js 16.4 re-renders those pages: the first request to a
// re-rendered 404 may get the 200 shell once, and a re-rendered other-language redirect keeps its
// 308 but loses its `Location` header until the next build (status-codes.spec.ts; known issue in
// docs/specs/phase-3-public-site.md step 22).

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

// ADR-041: Googlebot matches `htmlLimitedBots`, so it skips the prerendered shells and every public
// page renders for it at request time, with blocking metadata. Each page must still answer its
// status, and every 200 page must have its canonical inside <head> (Google ignores one outside).
const GOOGLEBOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

const headOf = (html: string) => html.slice(0, Math.max(0, html.indexOf("</head>")));

test("Googlebot gets every public page's status, and the canonical in <head> on each 200", async ({ request }) => {
  for (const [path, status] of PUBLIC_PAGES) {
    const response = await request.get(path, { maxRedirects: 0, headers: { "user-agent": GOOGLEBOT } });
    expect(response.status(), path).toBe(status);
    if (status === 308) expect(response.headers()["location"], `${path} Location`).toBeTruthy();
    if (status === 200) expect(headOf(await response.text()), path).toMatch(/<link rel="canonical" href="[^"]+"/);
  }
});

test("an unknown slug is a real 404 for Googlebot on its first visit (no prerendered fallback shell)", async ({ request }) => {
  // Browsers get the fallback shell (200, noindex) on an unknown slug's first visit (Phase 3 spec
  // step 22); Googlebot's blocking render answers the 404 at once. Slugs used nowhere else.
  for (const path of ["/tours/googlebot-khong-co-tour-nay", "/diem-den/googlebot-khong-co-diem-den-nay"]) {
    const response = await request.get(path, { maxRedirects: 0, headers: { "user-agent": GOOGLEBOT } });
    expect(response.status(), path).toBe(404);
  }
});

test("a browser still gets the listing's metadata streamed after <head> (control for ADR-041)", async ({ request }) => {
  const html = await (await request.get("/tours", { headers: { "user-agent": CHROME } })).text();
  expect(headOf(html)).not.toContain('rel="canonical"');
  expect(html).toContain('rel="canonical"');
});
