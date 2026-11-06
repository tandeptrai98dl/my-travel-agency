import { expect, type Page, test } from "@playwright/test";

/** Pretend the visitor already chose "essential only", so the banner stays out of the way. */
async function dismissConsent(page: Page) {
  await page.context().addCookies([
    { name: "consent", value: "v1.a0.m0", domain: "localhost", path: "/" },
  ]);
}

test.describe("site shell (desktop)", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("header and footer show data from the database, not from code", async ({ page }) => {
    await dismissConsent(page);
    await page.goto("/en/does-not-exist");
    // Brand and company details come from `settings` (seed: "Premium Travel Agency (sample)").
    await expect(page.getByRole("banner").getByRole("link").first()).toHaveText(/Premium Travel Agency/);
    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("Premium Travel Agency");
    await expect(footer).toContainText("hello@example.com");
  });

  test("skip link moves focus to the main content", async ({ page }) => {
    await dismissConsent(page);
    await page.goto("/en");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("destinations mega menu lists the database tree and works with the keyboard", async ({ page }) => {
    await dismissConsent(page);
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Điểm đến" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    // Seeded destinations, in Vietnamese with localized slugs.
    const menu = page.getByRole("navigation", { name: "Điều hướng chính" });
    await expect(menu.getByRole("link", { name: "Việt Nam" })).toHaveAttribute("href", "/diem-den/viet-nam");
    await expect(menu.getByRole("link", { name: "Vịnh Hạ Long" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("primary navigation uses localized paths", async ({ page }) => {
    await dismissConsent(page);
    await page.goto("/en");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Tailor-made" })).toHaveAttribute("href", "/en/tailor-made");
    await page.goto("/");
    await expect(
      page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: "Thiết kế riêng" }),
    ).toHaveAttribute("href", "/thiet-ke-rieng");
  });

  test("floating contact shows the hotline from settings", async ({ page }) => {
    await dismissConsent(page);
    await page.goto("/en");
    const quick = page.getByRole("navigation", { name: "Quick contact" });
    await expect(quick.getByRole("link", { name: /Call our hotline/ })).toHaveAttribute("href", /^tel:\+84/);
  });
});

test.describe("cookie consent", () => {
  test("nothing is set until the visitor chooses; essential only is one click", async ({ page }) => {
    await page.goto("/en");
    const banner = page.getByRole("region", { name: "Cookies on this website" });
    await expect(banner).toBeVisible();
    expect((await page.context().cookies()).find((c) => c.name === "consent")).toBeUndefined();

    await banner.getByRole("button", { name: "Essential only" }).click();
    await expect(banner).toBeHidden();
    const consent = (await page.context().cookies()).find((c) => c.name === "consent");
    expect(consent?.value).toBe("v1.a0.m0");

    await page.reload();
    await expect(page.getByRole("region", { name: "Cookies on this website" })).toBeHidden();
  });

  test("settings can be changed later from the footer", async ({ page }) => {
    await dismissConsent(page);
    await page.goto("/en");
    await page.getByRole("contentinfo").getByRole("button", { name: "Cookie settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Cookie settings" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("switch", { name: "Analytics" }).click();
    await dialog.getByRole("button", { name: "Save my choices" }).click();
    await expect(dialog).toBeHidden();
    const consent = (await page.context().cookies()).find((c) => c.name === "consent");
    expect(consent?.value).toBe("v1.a1.m0");
  });
});

test.describe("site shell (mobile)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("menu opens in a sheet, lists destinations and closes with Escape", async ({ page }) => {
    await dismissConsent(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Mở menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Điểm đến" }).click();
    await expect(sheet.getByRole("link", { name: "Việt Nam" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("the floating contact steps aside while the cookie banner is open", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("region", { name: "Cookies on this website" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Quick contact" })).toBeHidden();
    await page.getByRole("button", { name: "Essential only" }).click();
    await expect(page.getByRole("navigation", { name: "Quick contact" })).toBeVisible();
  });
});
