import { expectNoSeriousViolations } from "./support/axe";
import { expect, type Page, test } from "./support/test";

// The tailor-made wizard (Phase 5 PR 5W). CI has no Turnstile, Upstash or Resend keys, so the form
// is shown disabled; its steps, per-step checks and the browser draft still work.

async function dismissConsent(page: Page) {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("baseURL is not configured");
  await page.context().addCookies([{ name: "consent", value: "v1.a0.m0", url }]);
}

test.beforeEach(async ({ page }) => dismissConsent(page));

test("the wizard shows one step at a time and is disabled until its services exist", async ({ page }) => {
  await page.goto("/thiet-ke-rieng");
  await expect(page.getByRole("heading", { level: 1, name: "Hành trình của riêng bạn" })).toBeVisible();
  const steps = page.getByRole("list", { name: "Bước 1 trên 5" });
  await expect(steps.getByRole("listitem")).toHaveCount(5);
  await expect(page.getByRole("heading", { level: 2, name: "Bạn muốn đi đâu?" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Chúng tôi liên hệ bạn thế nào?" })).toBeHidden();
  await expect(page.getByText(/Biểu mẫu tạm thời chưa nhận yêu cầu/)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Việt Nam" })).toBeDisabled();
  await expectNoSeriousViolations(page, "tailor-made 1280");
  await page.setViewportSize({ width: 375, height: 812 });
  await expectNoSeriousViolations(page, "tailor-made 375");
});

test("before hydration only step 1 shows and its buttons stay invisible", async ({ page }) => {
  // The app's chunks never arrive, so React never hydrates (JavaScript itself runs).
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
  await page.goto("/thiet-ke-rieng");
  await expect(page.getByRole("heading", { level: 2, name: "Bạn muốn đi đâu?" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Chúng tôi liên hệ bạn thế nào?" })).toBeHidden();
  // A native submit from here would stop at required fields in the hidden steps.
  await expect(page.getByRole("button", { name: "Gửi yêu cầu" })).toBeHidden();
});

test("English page and the menu link", async ({ page }) => {
  await page.goto("/en/tailor-made");
  await expect(page.getByRole("heading", { level: 1, name: "A journey of your own" })).toBeVisible();
  await expect(page.locator('link[rel="alternate"][hreflang="vi"]')).toHaveAttribute("href", /\/thiet-ke-rieng$/);
});
