import { expect, type Page, test } from "./support/test";

import { expectNoSeriousViolations } from "./support/axe";
import { dismissConsent } from "./support/consent";

// Seeded catalog (supabase/seed.sql): 31 tours published in Vietnamese and 29 in English. Việt Nam
// has 3 (VN-HLB-03, VN-NTH-06, VN-HER-05); Thái Lan 13 (the "Phase 3 PR L" block), two of them 15
// days or longer; Pháp 14 in Vietnamese and 13 in English (FR-PAR-07 has no English text).

const results = (page: Page) => page.getByRole("region", { name: "Kết quả" });
const cards = (page: Page) => results(page).getByRole("list").first().getByRole("heading", { level: 3 });
const count = (page: Page) => results(page).getByRole("status");

test.describe("tour listing", () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test("12 tours per page with numbered pages; unfiltered pages are canonical with hreflang", async ({ page }) => {
    await page.goto("/tours");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tất cả hành trình");
    await expect(count(page)).toHaveText("31 hành trình");
    await expect(cards(page)).toHaveCount(12);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

    const pagination = page.getByRole("navigation", { name: "Phân trang" });
    await pagination.getByRole("link", { name: "Trang 3" }).click();
    await expect(page).toHaveURL(/\/tours\?page=3/);
    await expect(cards(page)).toHaveCount(7);
    await expect(page.getByRole("link", { name: "Trang 3" })).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle(/Trang 3/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/tours\?page=3$/);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/en\/tours\?page=3$/);
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(jsonLd.some((text) => text.includes('"ItemList"') && text.includes('"numberOfItems":7'))).toBe(true);
  });

  test("search ignores diacritics and finds a tour by its code", async ({ page }) => {
    await page.goto("/tours");
    await page.getByRole("searchbox", { name: "Tìm hành trình" }).fill("vinh ha long");
    await expect(page).toHaveURL(/\?q=vinh\+ha\+long$/);
    await expect(cards(page).first()).toHaveText(/Hạ Long/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/tours$/);

    await page.goto("/tours?q=th-bkk-03");
    await expect(cards(page)).toHaveText(["Bangkok ba ngày"]);
  });

  test("desktop filters apply at once, keep one URL per search, and Back restores it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/tours");
    // From lg the filters are a plain region of the listing form, not a dialog (#35 review m3).
    const column = page.getByRole("region", { name: "Bộ lọc" });
    await expect(column).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(column.getByRole("button", { name: "Áp dụng" })).toBeHidden();
    const filters = column.getByRole("group", { name: "Điểm đến" });
    await filters.getByRole("checkbox", { name: "Thái Lan", exact: true }).check();
    await expect(page).toHaveURL(/\/tours\?dest=thailand$/);
    await expect(count(page)).toHaveText("13 hành trình");
    // Children of a chosen country are included and step aside.
    await expect(filters.getByRole("checkbox", { name: "Bangkok" })).toBeDisabled();

    await page.getByRole("combobox", { name: "Sắp xếp" }).selectOption({ label: "Giá thấp đến cao" });
    await expect(page).toHaveURL(/\/tours\?dest=thailand&sort=price_asc$/);
    const prices = await results(page)
      .locator("a")
      .filter({ has: page.getByRole("heading", { level: 3 }) })
      .evaluateAll((links) => links.map((link) => Number((link.textContent ?? "").match(/Từ\s*([\d.]+)/)?.[1]?.replace(/\./g, "") ?? NaN)));
    expect(prices.length).toBe(12);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    await page.getByRole("group", { name: "Thời lượng" }).getByRole("checkbox", { name: "Từ 15 ngày" }).check();
    await expect(page).toHaveURL(/\/tours\?dest=thailand&duration=15-plus&sort=price_asc$/);
    await expect(cards(page)).toHaveText(["Thái Lan mười lăm ngày", "Thái Lan mười tám ngày"]);

    // A chip removes one filter; Back brings it back.
    await page.getByRole("navigation", { name: "Bộ lọc đang chọn" }).getByRole("link", { name: "Bỏ lọc Từ 15 ngày" }).click();
    await expect(page).toHaveURL(/\/tours\?dest=thailand&sort=price_asc$/);
    await page.goBack();
    await expect(page).toHaveURL(/duration=15-plus/);
    await expect(cards(page)).toHaveCount(2);
  });

  test("Googlebot gets the listing's canonical and hreflang in <head> (htmlLimitedBots, ADR-041)", async ({ request }) => {
    const googlebot =
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
    const html = await (await request.get("/tours", { headers: { "user-agent": googlebot } })).text();
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toMatch(/<link rel="canonical" href="[^"]*\/tours"/);
    expect(head).toMatch(/<link rel="alternate" hrefLang="en" href="[^"]*\/en\/tours"/);
  });

  test("mobile: before hydration, Filters still opens and closes the sheet (invoker commands)", async ({ page }) => {
    // JavaScript runs (React's inline scripts reveal the streamed results) but the app's chunks
    // never arrive, so React never hydrates: the buttons work only through command/commandfor.
    // Scripts only: Turbopack serves the stylesheets from the same folder.
    await page.route("**/_next/static/chunks/**", (route) => (route.request().resourceType() === "script" ? route.abort() : route.fallback()));
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/tours");
    const open = page.getByRole("button", { name: "Bộ lọc", exact: true });
    await open.click();
    const sheet = page.getByRole("dialog", { name: "Bộ lọc" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Đóng bộ lọc" }).click();
    await expect(sheet).toBeHidden();
  });

  test("mobile: the filter sheet stages choices until Apply and returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/tours");
    const open = page.getByRole("button", { name: "Bộ lọc", exact: true });
    await open.click();
    const sheet = page.getByRole("dialog", { name: "Bộ lọc" });
    await expect(sheet).toBeVisible();
    await expectNoSeriousViolations(page, "filter sheet 375");
    await sheet.getByRole("checkbox", { name: "Nước ngoài" }).check();
    await sheet.getByRole("checkbox", { name: "Từ 15 ngày" }).check();
    await expect(page).toHaveURL(/\/tours$/);

    // Escape drops staged choices.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(open).toBeFocused();
    await open.click();
    await expect(sheet.getByRole("checkbox", { name: "Từ 15 ngày" })).not.toBeChecked();

    await sheet.getByRole("checkbox", { name: "Từ 15 ngày" }).check();
    await sheet.getByRole("button", { name: "Áp dụng" }).click();
    await expect(page).toHaveURL(/\/tours\?duration=15-plus$/);
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("button", { name: "Bộ lọc (1)" })).toBeVisible();
    const chips = page.getByRole("navigation", { name: "Bộ lọc đang chọn" });
    await chips.getByRole("link", { name: "Bỏ lọc Từ 15 ngày" }).click();
    await expect(page).toHaveURL(/\/tours$/);
  });

  test("no matching tours: suggestions, a contact link and Clear filters", async ({ page }) => {
    await page.goto("/tours?q=khong-co-hanh-trinh-nay&scope=domestic");
    await expect(page.getByRole("heading", { name: "Chưa có hành trình phù hợp" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Thiết kế hành trình riêng" }).first()).toHaveAttribute("href", "/thiet-ke-rieng");
    await page.getByRole("link", { name: "Xoá bộ lọc" }).click();
    await expect(page).toHaveURL(/\/tours$/);
    await expect(count(page)).toHaveText("31 hành trình");
  });

  test("invalid parameters are dropped and a page past the end goes to the last page", async ({ page }) => {
    await page.goto("/tours?dest=atlantis&duration=3-5&sort=cheapest&price_min=abc");
    await expect(count(page)).toHaveText("31 hành trình");
    await expect(page.getByRole("navigation", { name: "Bộ lọc đang chọn" })).toHaveCount(0);
    await page.goto("/tours?page=99");
    await expect(page).toHaveURL(/\/tours\?page=3$/);
  });

  test("English lists only tours published in English and keeps the filters in the URL", async ({ page }) => {
    await page.goto("/en/tours?dest=france");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("All journeys");
    await expect(page.getByRole("region", { name: "Results" }).getByRole("status")).toHaveText("13 journeys");
    await page.goto("/en/tours");
    await expect(page.getByRole("region", { name: "Results" }).getByRole("status")).toHaveText("29 journeys");
  });

  test("destination and travel style pages link to their filtered listing", async ({ page }) => {
    await page.goto("/diem-den/viet-nam");
    await page.getByRole("link", { name: "Xem tất cả 3 hành trình" }).click();
    await expect(page).toHaveURL(/\/tours\?dest=vietnam$/);
    await expect(count(page)).toHaveText("3 hành trình");
    await page.goto("/phong-cach/trang-mat");
    await expect(page.getByRole("link", { name: "Xem tất cả 2 hành trình" })).toHaveAttribute("href", "/tours?style=honeymoon");
  });

  test("no serious axe violations at 375 and 1280 px", async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tours?dest=thailand");
      await expect(count(page)).toHaveText("13 hành trình");
      await expectNoSeriousViolations(page, `tours ${width}`);
    }
  });
});

test.describe("site search", () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test("finds tours, destinations and articles, never indexed", async ({ page }) => {
    await page.goto("/tim-kiem");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await page.getByRole("searchbox", { name: "Từ khoá" }).fill("provence");
    await page.getByRole("button", { name: "Tìm", exact: true }).click();
    await expect(page).toHaveURL(/\/tim-kiem\?q=provence$/);
    await expect(page.getByRole("heading", { level: 2, name: "Kết quả cho “provence”" })).toBeVisible();
    await expect(page.getByRole("region", { name: /Hành trình/ }).getByRole("heading", { level: 3 }).filter({ hasText: "Provence" })).not.toHaveCount(0);
    await expect(page.getByRole("region", { name: "Điểm đến" }).getByRole("link", { name: "Provence" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Bài viết" }).getByRole("link", { name: "Provence mùa oải hương" })).toHaveAttribute(
      "href",
      "/journal/provence-mua-oai-huong",
    );
    await expectNoSeriousViolations(page, "search results");
  });

  test("diacritics are optional and an empty result offers the listing", async ({ page }) => {
    await page.goto("/tim-kiem?q=vinh%20ha%20long");
    await expect(page.getByRole("region", { name: "Điểm đến" }).getByRole("link", { name: "Vịnh Hạ Long" })).toBeVisible();
    await page.goto("/en/search?q=zzqqxx");
    await expect(page.getByText("Nothing matched “zzqqxx”.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse all journeys" })).toHaveAttribute("href", "/en/tours");
  });
});
