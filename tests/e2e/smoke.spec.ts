import { expect, test } from "@playwright/test";

test("Vietnamese home page is served without a prefix", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Website mới của chúng tôi sắp ra mắt",
  );
});

test("English home page is served under /en", async ({ page }) => {
  const response = await page.goto("/en");
  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Our new website is on its way");
});

test("switching language keeps the page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("link", { name: "Tiếng Việt" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
});

test("unknown pages return a localized 404", async ({ page }) => {
  const vi = await page.goto("/khong-ton-tai");
  expect(vi?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Không tìm thấy trang" })).toBeVisible();

  const en = await page.goto("/en/does-not-exist");
  expect(en?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("responses carry the baseline security headers", async ({ request }) => {
  const response = await request.get("/en");
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-content-type-options"]).toBe("nosniff");
});

test("health check reports the database", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", db: "ok" });
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("email links cannot redirect off-site", async ({ request }) => {
  const response = await request.get("/auth/confirm?next=//evil.example", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toMatch(/^\/auth\/error|^http:\/\/localhost[^/]*\/auth\/error/);
});
