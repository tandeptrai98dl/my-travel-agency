import { expect, test } from "@playwright/test";

test("Vietnamese home page is served without a prefix", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  // The hero title from the seeded `homepage` setting (supabase/seed.sql).
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Những chuyến đi được chăm chút từng chi tiết");
});

test("English home page is served under /en", async ({ page }) => {
  const response = await page.goto("/en");
  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Journeys shaped down to the smallest detail");
});

test("switching language keeps the page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("banner").getByRole("link", { name: "Tiếng Việt" }).click();
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
  for (const path of ["/en", "/admin", "/api/health", "/robots.txt"]) {
    const headers = (await request.get(path, { maxRedirects: 0 })).headers();
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["strict-transport-security"], path).toContain("max-age=");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"], path).toContain("camera=()");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
  }
});

test("health check reports the database", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", db: "ok" });
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("unknown admin, API and auth paths return 404", async ({ request }) => {
  for (const path of ["/admin/does-not-exist", "/api/does-not-exist", "/auth/does-not-exist"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("a Vietnamese slug under /en redirects to the English slug", async ({ request }) => {
  const response = await request.get("/en/diem-den", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers()["location"]!, "http://localhost").pathname).toBe(
    "/en/destinations",
  );
});

test("public pages set no locale cookie and no hreflang Link header", async ({ request }) => {
  const response = await request.get("/en");
  expect(response.headers()["set-cookie"] ?? "").not.toContain("NEXT_LOCALE");
  expect(response.headers()["link"] ?? "").not.toContain("hreflang");
});
