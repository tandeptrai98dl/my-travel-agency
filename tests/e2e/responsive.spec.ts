import { expect, type Page, test } from "./support/test";

// Phase 6 responsive pass (docs/specs/phase-6-hardening-launch.md decision 5, docs/QA_REPORT.md):
// no main public page scrolls sideways at the narrowest phone width we support, in either
// language, and the header switches to the menu sheet below 1280 px, where the desktop
// navigation no longer fits on one line. Tour pages at 375 and 1280 px are also checked in
// tour-detail.spec.ts, the booking page at 375 px in booking-flow.spec.ts.

async function dismissConsent(page: Page) {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("baseURL is not configured");
  await page.context().addCookies([{ name: "consent", value: "v1.a0.m0", url }]);
}

const PUBLIC_PAGES = [
  "/",
  "/en",
  "/tours",
  "/en/tours",
  "/tours/du-thuyen-vinh-ha-long",
  "/en/tours/ha-long-bay-cruise",
  "/tim-kiem?q=ha%20long",
  "/diem-den",
  "/diem-den/viet-nam",
  "/en/destinations/vietnam",
  "/phong-cach/trang-mat",
  "/journal",
  "/journal/mot-ngay-tren-vinh-lan-ha",
  "/ve-chung-toi",
  "/cau-hoi-thuong-gap",
  "/chinh-sach/chinh-sach-bao-mat",
  "/danh-gia",
  "/lien-he",
  "/en/contact",
  "/thiet-ke-rieng",
  "/en/tailor-made",
];

test("no main public page scrolls sideways at 360px", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await dismissConsent(page);
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} scrolls sideways at 360px`).toBeLessThanOrEqual(0);
  }
});

for (const [width, desktop] of [
  [1024, false],
  [1280, true],
] as const) {
  test(`the header ${desktop ? "shows the desktop navigation" : "uses the menu sheet"} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await dismissConsent(page);
    await page.goto("/lien-he");
    const header = page.getByRole("banner");
    const nav = header.getByRole("navigation", { name: "Điều hướng chính" });
    const menu = header.getByRole("button", { name: "Mở menu" });
    if (desktop) {
      await expect(nav).toBeVisible();
      await expect(menu).toBeHidden();
    } else {
      await expect(nav).toBeHidden();
      await expect(menu).toBeVisible();
    }
    // The brand stays on one line either way (Vietnamese labels are the longest).
    const brand = header.getByRole("link").first();
    const lineHeight = await brand.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight));
    expect((await brand.boundingBox())!.height).toBeLessThanOrEqual(lineHeight * 1.5);
  });
}
