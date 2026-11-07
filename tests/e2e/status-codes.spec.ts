import { expect, test } from "./support/test";

// Real status codes from the prerender (Phase 3 spec step 22). This file runs in its own Playwright
// project before every other spec (playwright.config.ts): other specs save tours, destinations and
// articles, and Next.js 16.4 re-renders a page after such a tag refresh. The first request after a
// refresh gets the 200 shell, and a re-rendered redirect keeps its 308 but loses its Location
// header (its payload still redirects browsers; known issue in the Phase 3 spec), so the headers
// are checked here, on the fresh build.

test("a slug of the other language is a real 308 to this language's slug", async ({ request }) => {
  for (const [from, to] of [
    ["/en/tours/du-thuyen-vinh-ha-long", "/en/tours/ha-long-bay-cruise"],
    ["/tours/ha-long-bay-cruise", "/tours/du-thuyen-vinh-ha-long"],
    ["/en/destinations/viet-nam", "/en/destinations/vietnam"],
    ["/diem-den/vietnam", "/diem-den/viet-nam"],
  ]) {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(308);
    expect(response.headers().location, from).toBe(to);
  }
});

test("the other language's slug without a published translation here is a real 404", async ({ page }) => {
  // JP-KYT-07 is published in Vietnamese only.
  const response = await page.goto("/en/tours/kyoto-tokyo-mua-thu");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
});
