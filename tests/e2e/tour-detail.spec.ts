import { expect, type Page, test } from "./support/test";

import { expectNoSeriousViolations } from "./support/axe";

// Seeded tours (supabase/seed.sql): VN-HLB-03 group tour in VI and EN; VN-HER-05 private tour;
// JP-KYT-07 with an unpublished English translation; VN-PQC-04 a draft.
const GROUP_VI = "/tours/du-thuyen-vinh-ha-long";
const GROUP_EN = "/en/tours/ha-long-bay-cruise";
const PRIVATE_VI = "/tours/di-san-hoi-an-hue";

async function dismissConsent(page: Page) {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("baseURL is not configured");
  await page.context().addCookies([{ name: "consent", value: "v1.a0.m0", url }]);
}

/**
 * A page that does not exist in this language. Slugs listed at build time (the other language's
 * published slugs) answer a real 404 at once. An unknown slug's first visit gets the prerendered
 * fallback shell (200, noindex) while the page renders; from then on the stored page answers 404
 * (Phase 3 spec step 22).
 */
async function expectNotFound(page: Page, path: string, title: string) {
  const response = await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  if (response?.status() !== 404) {
    expect(response?.status()).toBe(200);
    await expect.poll(async () => (await page.request.get(path, { maxRedirects: 0 })).status(), { timeout: 15_000 }).toBe(404);
  }
}

test.describe("tour detail", () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test("a group tour shows its content, live departures and the booking box in Vietnamese", async ({ page }) => {
    await page.goto(GROUP_VI);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Du thuyền vịnh Hạ Long");
    await expect(page.getByRole("navigation", { name: "Đường dẫn" })).toContainText("Trang chủ");
    await expect(page.getByRole("heading", { name: "Lịch trình" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hà Nội – vịnh Lan Hạ" })).toBeVisible();

    const departures = page.locator("#departures");
    await expect(departures.getByRole("heading", { name: "Lịch khởi hành" })).toBeVisible();
    await expect(departures.getByRole("table")).toBeVisible();
    await expect(departures.getByRole("table").getByText("Còn chỗ").first()).toBeVisible();

    const booking = page.getByRole("complementary", { name: "Đặt tour" });
    await expect(booking.getByText(/12\.900\.000/)).toBeVisible();
    await expect(booking.getByRole("link", { name: /Gọi .* để đặt chỗ/ })).toHaveAttribute("href", /^tel:\+?\d+$/);

    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(jsonLd.some((text) => text.includes('"TouristTrip"') && text.includes('"AggregateOffer"'))).toBe(true);
    expect(jsonLd.some((text) => text.includes('"BreadcrumbList"'))).toBe(true);
  });

  test("hreflang lists only published languages and the switcher goes to the other slug", async ({ page }) => {
    await page.goto(GROUP_VI);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/en\/tours\/ha-long-bay-cruise$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/tours\/du-thuyen-vinh-ha-long$/);
    const english = page.getByRole("banner").getByRole("link", { name: "English" });
    await expect(english).toHaveAttribute("href", "/en/tours/ha-long-bay-cruise");
    await english.click();
    await expect(page).toHaveURL(new RegExp(`${GROUP_EN}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ha Long Bay Cruise");

    // JP-KYT-07 has no published English translation: no hreflang, and the switcher offers the
    // English tour list instead.
    await page.goto("/tours/kyoto-tokyo-mua-thu");
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: "English" })).toHaveAttribute("href", "/en/tours");
  });

  test("a slug of the other language redirects to this language's slug", async ({ page }) => {
    // The status codes are checked on the fresh build in status-codes.spec.ts.
    await page.goto("/en/tours/du-thuyen-vinh-ha-long");
    await expect(page).toHaveURL(new RegExp(`${GROUP_EN}$`));
  });

  test("drafts and unpublished translations are not found", async ({ page }) => {
    await expectNotFound(page, "/tours/nghi-duong-phu-quoc", "Không tìm thấy trang");
    await expectNotFound(page, "/en/tours/kyoto-tokyo-autumn", "Page not found");
    await expectNotFound(page, "/tours/khong-co-tour-nay", "Không tìm thấy trang");
  });

  test("a private tour shows indicative prices by group size and the call path", async ({ page }) => {
    await page.goto(PRIVATE_VI);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Di sản Hội An và Huế");
    await expect(page.getByRole("heading", { name: "Giá tham khảo theo số khách" })).toBeVisible();
    await expect(page.getByText("2–3 khách")).toBeVisible();
    await expect(page.getByText(/24\.900\.000/).first()).toBeVisible();
    await expect(page.locator("#departures")).toHaveCount(0);
    const booking = page.getByRole("complementary", { name: "Đặt tour" });
    await expect(booking.getByRole("link", { name: /Gọi .* để được tư vấn/ })).toBeVisible();
  });

  test("the listing links published tours and never drafts", async ({ page }) => {
    await page.goto("/tours");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tất cả hành trình");
    await expect(page.getByRole("link", { name: /Du thuyền vịnh Hạ Long/ })).toHaveAttribute("href", GROUP_VI);
    await page.goto("/tours?q=phu%20quoc");
    await expect(page.getByRole("heading", { name: "Chưa có hành trình phù hợp" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Nghỉ dưỡng Phú Quốc/ })).toHaveCount(0);
  });

  for (const width of [375, 1280]) {
    test(`has no serious accessibility violations at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [GROUP_VI, GROUP_EN, PRIVATE_VI, "/tours"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
        await expectNoSeriousViolations(page, `${path} at ${width}px`);
      }
    });
  }
});
