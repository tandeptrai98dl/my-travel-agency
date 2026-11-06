import { expect, type Page, test } from "@playwright/test";

import { expectNoSeriousViolations } from "./support/axe";

// Seeded homepage (supabase/seed.sql): the `homepage` setting has the hero text, featured
// destinations vietnam, japan, france and no hero image; featured tours VN-HLB-03, VN-NTH-06 and
// JP-KYT-07 (no published English translation); four travel styles; no reviews; no journal
// routes yet. CI has no Turnstile, Upstash or Resend keys, so the newsletter form is disabled.

async function dismissConsent(page: Page) {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("baseURL is not configured");
  await page.context().addCookies([{ name: "consent", value: "v1.a0.m0", url }]);
}

test.describe("homepage", () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test("Vietnamese sections come from the database", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Những chuyến đi được chăm chút từng chi tiết");
    // No hero image in the seed: the hero is the navy band, with no image inside it.
    await expect(page.locator("main section").first().locator("img")).toHaveCount(0);

    const trust = page.getByRole("region", { name: "Vì sao chọn chúng tôi" });
    await expect(trust.getByText("Tư vấn Thứ Hai – Thứ Bảy, 8:30–18:00")).toBeVisible();
    await expect(trust.getByText(/^Hotline \+84/)).toBeVisible();
    // No licence in the seed and no online payment yet: those items are left out.
    await expect(trust.getByText(/Giấy phép/)).toHaveCount(0);
    await expect(trust.getByText(/VNPay/)).toHaveCount(0);

    const featured = page.getByRole("region", { name: "Những chuyến đi được yêu thích" });
    await expect(featured.getByRole("heading", { level: 3 })).toHaveCount(3);
    await expect(featured.getByRole("link", { name: /Du thuyền vịnh Hạ Long/ })).toHaveAttribute("href", "/tours/du-thuyen-vinh-ha-long");
    await expect(featured.getByRole("link", { name: "Xem tất cả hành trình" })).toHaveAttribute("href", "/tours");

    const destinations = page.getByRole("region", { name: "Nơi chúng tôi đưa bạn đến" });
    await expect(destinations.getByRole("heading", { level: 3 })).toHaveText(["Việt Nam", "Nhật Bản", "Pháp"]);
    await expect(destinations.getByRole("link").first()).toHaveAttribute("href", "/diem-den/viet-nam");

    const styles = page.getByRole("region", { name: "Đi theo cách của bạn" });
    await expect(styles.getByRole("heading", { level: 3 })).toHaveCount(4);
    await expect(styles.getByRole("link", { name: /Trăng mật/ })).toHaveAttribute("href", "/phong-cach/trang-mat");

    // Sections without data are left out: no reviews, no journal routes yet.
    await expect(page.getByText("Khách hàng kể lại")).toHaveCount(0);
    await expect(page.getByText("Cảm hứng cho chuyến đi tới")).toHaveCount(0);

    // Tailor-made: the hotline and email until the inquiry wizard and the contact page exist.
    const tailorMade = page.getByRole("region", { name: "Một hành trình chỉ dành cho bạn" });
    await expect(tailorMade.getByRole("link", { name: /^Gọi \+84/ })).toHaveAttribute("href", /^tel:\+84/);
    await expect(tailorMade.getByRole("link", { name: "Gửi email cho chúng tôi" })).toHaveAttribute("href", /^mailto:/);
  });

  test("English shows only tours published in English", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Journeys shaped down to the smallest detail");
    const featured = page.getByRole("region", { name: "Journeys our travellers love" });
    await expect(featured.getByRole("link", { name: /Ha Long Bay Cruise/ })).toHaveAttribute("href", "/en/tours/ha-long-bay-cruise");
    await expect(featured.getByRole("heading", { level: 3 })).toHaveCount(2);
    await expect(featured.getByRole("link", { name: "View all journeys" })).toHaveAttribute("href", "/en/tours");
  });

  test("the hero search lands on a filtered listing, without JavaScript too", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    const search = page.getByRole("search", { name: "Tìm hành trình" });
    await search.getByLabel("Điểm đến").selectOption("vietnam");
    await search.getByLabel("Tháng khởi hành").selectOption({ index: 2 });
    await search.getByLabel("Phong cách").selectOption("honeymoon");
    await search.getByRole("button", { name: "Tìm hành trình" }).click();
    await expect(page).toHaveURL(/\/tours\?dest=vietnam&month=\d{4}-\d{2}&style=honeymoon$/);
    await context.close();
  });

  test("metadata, TravelAgency JSON-LD and the generated Open Graph image", async ({ page, request }) => {
    for (const [path, locale] of [
      ["/", "vi_VN"],
      ["/en", "en_GB"],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveTitle(/^Premium Travel Agency \(sample\) — /);
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(1);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
      await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", locale);
      const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
      expect(jsonLd["@type"]).toEqual(["TravelAgency", "Organization"]);
      expect(jsonLd.name).toBe("Premium Travel Agency (sample)");

      const image = await page.locator('meta[property="og:image"]').getAttribute("content");
      expect(image).toMatch(/\/(vi|en)\/opengraph-image/);
      const response = await request.get(new URL(image!).pathname + new URL(image!).search);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
    }
  });

  test("the newsletter form is disabled until its services are configured", async ({ page }) => {
    await page.goto("/");
    const form = page.getByRole("region", { name: "Những hành trình mới, mỗi tháng một lần" });
    await expect(form.getByLabel("Email của bạn")).toBeDisabled();
    await expect(form.getByRole("button", { name: "Đăng ký" })).toBeDisabled();
    await expect(form.getByText("Đăng ký nhận bản tin sẽ sớm mở.")).toBeVisible();
  });

  test("the newsletter confirmation page refuses unknown and missing tokens", async ({ page }) => {
    await page.goto("/ban-tin/xac-nhan");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Liên kết không còn hiệu lực");
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);

    // A well-formed, fresh token that was never issued: the Postgres function finds no subscriber.
    const token = `${Date.now().toString(36)}.${"a".repeat(32)}`;
    await page.goto(`/en/newsletter/confirm?token=${token}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confirm your newsletter subscription");
    await page.getByRole("button", { name: "Confirm subscription" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link is no longer valid");
    await expect(page.getByRole("link", { name: "Back to the home page" })).toHaveAttribute("href", "/en");
  });

  test("no third-party request on load, and no serious axe violations at 375 and 1280 px", async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const origin = new URL(baseURL!).origin;
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : null;
    // Error monitoring is a processor for the site itself (as in shell.spec.ts); CI's fake DSN
    // envelopes are answered here so nothing leaves the runner.
    const sentryHost = process.env.NEXT_PUBLIC_SENTRY_DSN ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).host : null;
    await page.route("**/api/*/envelope/**", (route) => route.fulfill({ status: 200, body: "{}" }));
    const thirdParty: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (["data:", "blob:"].includes(url.protocol) || url.origin === origin || url.origin === supabase || url.host === sentryHost) return;
      thirdParty.push(request.url());
    });
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", "/en"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expectNoSeriousViolations(page, `${path} at ${width}px`);
      }
    }
    expect(thirdParty).toEqual([]);
  });
});
