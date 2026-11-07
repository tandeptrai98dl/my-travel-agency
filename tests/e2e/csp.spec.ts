import { expect, test } from "./support/test";

// CSP per page type (ADR-027, Phase 3 spec decision 13). Every spec also fails on any
// `securitypolicyviolation` through the shared guard in support/test.ts.

test("public pages and staff sign-in get the static nonce-free policy", async ({ request }) => {
  for (const path of ["/", "/en/tours", "/diem-den", "/auth/login"]) {
    const policy = (await request.get(path, { maxRedirects: 0 })).headers()["content-security-policy"] ?? "";
    expect(policy, path).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(policy, path).not.toContain("nonce-");
    expect(policy, path).toContain("frame-ancestors 'none'");
    expect(policy, path).toMatch(/img-src 'self' data: blob: https?:\/\/\S+/);
  }
});

test("the admin gets a fresh nonce policy on every request; the API none", async ({ request }) => {
  const nonces = new Set<string>();
  for (let i = 0; i < 2; i++) {
    const policy = (await request.get("/admin", { maxRedirects: 0 })).headers()["content-security-policy"] ?? "";
    const nonce = policy.match(/script-src 'self' 'nonce-([^']+)' 'strict-dynamic'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    nonces.add(nonce!);
  }
  expect(nonces.size).toBe(2);
  expect((await request.get("/api/health")).headers()["content-security-policy"]).toBeUndefined();
});

test("public pages render with their scripts under the policy", async ({ page }) => {
  // The guard fails the test on any violation; these pages load hydration, the menu and images.
  for (const path of ["/", "/tours", "/en/tours/ha-long-bay-cruise", "/journal", "/lien-he", "/auth/login"]) {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
  }
  await page.goto("/tours");
  await page.getByRole("group", { name: "Loại hành trình" }).getByRole("checkbox", { name: "Nước ngoài" }).check();
  await expect(page).toHaveURL(/scope=international/);
});
