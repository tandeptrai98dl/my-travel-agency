import { expect, type Page, test } from "@playwright/test";

import { expectNoSeriousViolations } from "./support/axe";

// Seeded content (supabase/seed.sql, "Phase 3 PR K" block): about, FAQ and privacy in both
// languages, cancellation in Vietnamese only, payment a draft (terms is created by the content
// admin E2E); three articles in two topics (Kyoto has no published English translation);
// three approved reviews (5, 5, 4) and one pending. CI has no Turnstile, Upstash or Resend keys.

async function dismissConsent(page: Page) {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("baseURL is not configured");
  await page.context().addCookies([{ name: "consent", value: "v1.a0.m0", url }]);
}

async function jsonLd(page: Page) {
  return (await page.locator('script[type="application/ld+json"]').allTextContents()).map((text) => JSON.parse(text));
}

test.describe("static pages, journal, reviews and contact", () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test("about and FAQ render from the pages table in both languages", async ({ page }) => {
    await page.goto("/ve-chung-toi");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Về chúng tôi");
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/en\/about$/);
    await page.goto("/en/faq");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Frequently asked questions");
    const faq = (await jsonLd(page)).find((data) => data["@type"] === "FAQPage");
    expect(faq.mainEntity[0]).toMatchObject({ "@type": "Question", name: "How much is the deposit?" });
    expect(faq.mainEntity).toHaveLength(2);
  });

  test("policies use their per-language slugs; the footer and banner link them", async ({ page }) => {
    await page.goto("/chinh-sach/chinh-sach-bao-mat");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chính sách bảo mật");
    const english = page.getByRole("banner").getByRole("link", { name: "English" });
    await expect(english).toHaveAttribute("href", "/en/policies/privacy-policy");

    // Cancellation is published in Vietnamese only; payment is a draft.
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Chính sách bảo mật" })).toHaveAttribute("href", "/chinh-sach/chinh-sach-bao-mat");
    await expect(footer.getByRole("link", { name: "Chính sách hủy" })).toHaveAttribute("href", "/chinh-sach/chinh-sach-huy");
    await expect(footer.getByRole("link", { name: "Thanh toán" })).toHaveCount(0);
    await expect(footer.getByRole("link", { name: "Tra cứu booking" })).toHaveCount(0);
    await page.goto("/en/policies/privacy-policy");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Privacy policy" })).toBeVisible();
    await expect(page.locator('link[rel="alternate"][hreflang="vi"]')).toHaveAttribute("href", /\/chinh-sach\/chinh-sach-bao-mat$/);

    await page.goto("/en/policies/chinh-sach-bao-mat");
    await expect(page).toHaveURL(/\/en\/policies\/privacy-policy$/);
    await page.goto("/chinh-sach/thanh-toan");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");

    // The cookie banner (before a choice) links the real privacy page.
    await page.context().clearCookies();
    await page.goto("/");
    const banner = page.getByRole("region", { name: "Cookie trên website" });
    await expect(banner.getByRole("link")).toHaveAttribute("href", "/chinh-sach/chinh-sach-bao-mat");
  });

  test("the journal lists articles by topic; an article carries Article data", async ({ page }) => {
    await page.goto("/journal");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tạp chí");
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText(["Một ngày trên vịnh Lan Hạ", "Kyoto mùa lá đỏ", "Provence mùa oải hương"]);
    const topics = page.getByRole("navigation", { name: "Chủ đề" });
    await topics.getByRole("link", { name: "Cảm hứng" }).click();
    await expect(page).toHaveURL(/\/journal\/chu-de\/cam-hung$/);
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(2);

    await page.goto("/journal/mot-ngay-tren-vinh-lan-ha");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Một ngày trên vịnh Lan Hạ");
    await expect(page.getByRole("heading", { level: 2, name: "Buổi sáng" })).toBeVisible();
    const article = (await jsonLd(page)).find((data) => data["@type"] === "Article");
    expect(article).toMatchObject({ headline: "Một ngày trên vịnh Lan Hạ", inLanguage: "vi" });
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");

    await page.goto("/en/journal");
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(2);
    await page.goto("/en/journal/kyoto-in-autumn");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  });

  test("the reviews page shows approved reviews only, with the average", async ({ page }) => {
    await page.goto("/danh-gia");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Đánh giá của khách");
    await expect(page.getByText("4,7 trên 5 · 3 đánh giá")).toBeVisible();
    await expect(page.getByText("Not yet moderated.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Tour: Du thuyền vịnh Hạ Long" })).toHaveAttribute("href", "/tours/du-thuyen-vinh-ha-long");
  });

  test("contact: details from settings, a disabled form without its services, prefilled from a tour", async ({ page }) => {
    await page.goto("/tours/du-thuyen-vinh-ha-long");
    const book = page.getByRole("complementary", { name: "Đặt tour" }).getByRole("link", { name: "Liên hệ đặt chỗ" });
    await expect(book).toHaveAttribute("href", /^\/lien-he\?tour=VN-HLB-03&date=\d{4}-\d{2}-\d{2}$/);
    await book.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Liên hệ");
    await expect(page.getByRole("textbox", { name: "Lời nhắn" })).toHaveValue(/^Tôi muốn đặt tour VN-HLB-03, khởi hành \d{2}\/\d{2}\/\d{4}\.$/);
    await expect(page.getByRole("textbox", { name: "Họ và tên" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Gửi lời nhắn" })).toBeDisabled();
    await expect(page.getByText(/Biểu mẫu sẽ sớm mở/)).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: /^\+84/ })).toHaveAttribute("href", /^tel:\+84/);
    // The tailor-made menu item opens the contact page until the wizard exists (Phase 5).
    await expect(page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: "Thiết kế riêng" })).toHaveAttribute("href", "/lien-he");
  });

  test("no serious axe violations at 375 and 1280 px", async ({ page }) => {
    test.setTimeout(120_000);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/ve-chung-toi", "/cau-hoi-thuong-gap", "/chinh-sach/chinh-sach-bao-mat", "/journal", "/journal/mot-ngay-tren-vinh-lan-ha", "/danh-gia", "/en/contact"]) {
        await page.goto(path);
        await expectNoSeriousViolations(page, `${path} at ${width}px`);
      }
    }
  });
});
