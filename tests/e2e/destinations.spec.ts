import { expect, type Page, test } from "@playwright/test";

import { expectNoSeriousViolations } from "./support/axe";

// Seeded destinations and styles (supabase/seed.sql): Việt Nam → Miền Bắc → Vịnh Hạ Long, Hà Nội…;
// published tours VN-HLB-03 (Hạ Long), VN-NTH-06 (Hà Nội, Sa Pa, Hạ Long), VN-HER-05 (Hội An,
// Huế), JP-KYT-07 (Kyoto…, Vietnamese only), FR-PRV-09 (Paris, Avignon); VN-PQC-04 (Phú Quốc,
// wellness) is a draft. Honeymoon: VN-HLB-03 and FR-PRV-09.

async function dismissConsent(page: Page) {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("baseURL is not configured");
  await page.context().addCookies([{ name: "consent", value: "v1.a0.m0", url }]);
}

test.describe("destinations and travel styles", () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test("the destinations page lists countries, regions and places with tour counts", async ({ page }) => {
    await page.goto("/diem-den");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Điểm đến");
    const vietnam = page.getByRole("region", { name: "Việt Nam" });
    await expect(vietnam.getByRole("link", { name: /Việt Nam/ }).first()).toHaveAttribute("href", "/diem-den/viet-nam");
    await expect(vietnam.getByText(/^3 hành trình/)).toBeVisible();
    await expect(vietnam.getByRole("link", { name: /Miền Bắc.*2 hành trình/ })).toHaveAttribute("href", "/diem-den/mien-bac");
    // A region whose only tour is a draft shows no count, not a dead end.
    await expect(vietnam.getByRole("link", { name: /Miền Nam.*Chưa có hành trình/ })).toBeVisible();
    await expect(vietnam.getByRole("link", { name: "Hà Nội" })).toHaveAttribute("href", "/diem-den/ha-noi");
    await expect(page.getByRole("region", { name: "Nhật Bản" })).toBeVisible();
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(jsonLd.some((text) => text.includes('"ItemList"') && text.includes("/diem-den/viet-nam"))).toBe(true);
  });

  test("a country page shows its regions, its tours and breadcrumbs", async ({ page }) => {
    await page.goto("/diem-den/viet-nam");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Việt Nam");
    await expect(page.getByText("Quanh năm, tùy vùng")).toBeVisible();
    const regions = page.getByRole("region", { name: "Các vùng ở Việt Nam" });
    await expect(regions.getByRole("heading", { level: 3 })).toHaveText(["Miền Bắc", "Miền Trung", "Miền Nam"]);
    const tours = page.getByRole("region", { name: "Hành trình ở Việt Nam" });
    await expect(tours.getByRole("link", { name: /Du thuyền vịnh Hạ Long/ })).toHaveAttribute("href", "/tours/du-thuyen-vinh-ha-long");
    await expect(tours.getByRole("heading", { level: 3 })).toHaveCount(3);
    await expect(page.getByRole("navigation", { name: "Đường dẫn" }).getByRole("link", { name: "Điểm đến" })).toHaveAttribute("href", "/diem-den");
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(jsonLd.some((text) => text.includes('"ItemList"') && text.includes("/tours/du-thuyen-vinh-ha-long"))).toBe(true);
    expect(jsonLd.some((text) => text.includes('"BreadcrumbList"'))).toBe(true);
  });

  test("a city page names its parents and lists the tours there", async ({ page }) => {
    await page.goto("/diem-den/vinh-ha-long");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vịnh Hạ Long");
    const trail = page.getByRole("navigation", { name: "Đường dẫn" });
    await expect(trail.getByRole("link", { name: "Miền Bắc" })).toHaveAttribute("href", "/diem-den/mien-bac");
    await expect(trail.getByRole("link", { name: "Việt Nam" })).toHaveAttribute("href", "/diem-den/viet-nam");
    await expect(page.getByRole("region", { name: "Hành trình ở Vịnh Hạ Long" }).getByRole("heading", { level: 3 })).toHaveCount(2);
  });

  test("languages: hreflang, the switcher, slugs of the other language and missing pages", async ({ page }) => {
    await page.goto("/diem-den/viet-nam");
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/en\/destinations\/vietnam$/);
    const english = page.getByRole("banner").getByRole("link", { name: "English" });
    await expect(english).toHaveAttribute("href", "/en/destinations/vietnam");
    await english.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vietnam");
    // Japan has no tour published in English.
    await page.goto("/en/destinations/japan");
    await expect(page.getByText(/No journeys here yet/)).toBeVisible();

    await page.goto("/en/destinations/viet-nam");
    await expect(page).toHaveURL(/\/en\/destinations\/vietnam$/);

    await page.goto("/diem-den/khong-co-diem-den-nay");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  });

  test("the mega menu opens real destination pages", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/en");
    await page.getByRole("button", { name: "Destinations" }).click();
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Japan", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/destinations\/japan$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Japan");
  });

  test("a travel style page lists its tours and the other styles", async ({ page }) => {
    await page.goto("/phong-cach/trang-mat");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trăng mật");
    const tours = page.getByRole("region", { name: "Hành trình Trăng mật" });
    await expect(tours.getByRole("heading", { level: 3 })).toHaveCount(2);
    await expect(tours.getByRole("link", { name: /Paris và Provence/ })).toHaveAttribute("href", "/tours/paris-va-provence");
    const others = page.getByRole("navigation", { name: "Phong cách khác" });
    await expect(others.getByRole("link", { name: "Văn hóa" })).toHaveAttribute("href", "/phong-cach/van-hoa");

    // Only a draft tour is in this style: an invitation instead of an empty grid.
    await page.goto("/en/travel-styles/wellness");
    await expect(page.getByText(/No journeys in this style yet/)).toBeVisible();
    await expect(page.getByRole("link", { name: /^Call \+84/ })).toHaveAttribute("href", /^tel:\+84/);
  });

  test("no serious axe violations at 375 and 1280 px", async ({ page }) => {
    test.setTimeout(90_000);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/diem-den", "/diem-den/viet-nam", "/en/destinations/ha-long-bay", "/phong-cach/trang-mat"]) {
        await page.goto(path);
        await expectNoSeriousViolations(page, `${path} at ${width}px`);
      }
    }
  });
});
