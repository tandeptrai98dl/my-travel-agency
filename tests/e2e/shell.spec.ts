import { expect, test } from "./support/test";

import { dismissConsent } from "./support/consent";

test.describe("site shell (desktop)", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("header and footer show data from the database, not from code", async ({ page }) => {
    await dismissConsent(page);
    await page.goto("/en/does-not-exist");
    // Brand and company details come from `settings`. The seed name differs from the code
    // default ("Premium Travel Agency"), so this fails if the shell falls back to messages.
    const brand = "Premium Travel Agency (sample)";
    await expect(page.getByRole("banner").getByRole("link").first()).toHaveText(brand);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByText(brand, { exact: true })).toBeVisible();
    await expect(footer).toContainText("hello@example.com");
    expect(await page.title()).toMatch(/Premium Travel Agency \(sample\)$/);
  });

  test("the footer links the guest booking lookup in both languages (Phase 5 PR 5B)", async ({ page }) => {
    await dismissConsent(page);
    for (const [home, name, path, heading] of [
      ["/", "Tra cứu booking", "/tra-cuu-booking", "Tra cứu đặt chỗ"],
      ["/en", "Find my booking", "/en/booking-lookup", "Find your booking"],
    ] as const) {
      await page.goto(home);
      const link = page.getByRole("contentinfo").getByRole("link", { name, exact: true });
      await expect(link).toHaveAttribute("href", path);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByTestId("lookup-form")).toBeVisible();
    }
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
    await expect(nav.getByRole("link", { name: "About" })).toHaveAttribute("href", "/en/about");
    await page.goto("/");
    await expect(
      page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: "Về chúng tôi" }),
    ).toHaveAttribute("href", "/ve-chung-toi");
  });

  test("the cookie banner never covers the floating contact buttons", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("region", { name: "Cookies on this website" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Quick contact" })).toBeHidden();
    await page.getByRole("button", { name: "Essential only" }).click();
    await expect(page.getByRole("navigation", { name: "Quick contact" })).toBeVisible();
    // The banner took the focused button with it; focus continues from the main content.
    await expect(page.locator("main#main")).toBeFocused();
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
    // The choice and its pseudonymous record id (cookie_consents.id, ADR-039).
    expect(consent?.value).toMatch(/^v1\.a0\.m0\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

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
    // `dismissConsent` set a value without an id; the saved choice gets one.
    expect(consent?.value).toMatch(/^v1\.a1\.m0\.[0-9a-f-]{36}$/);
    // The dialog has no trigger of its own: focus goes back to the button that opened it.
    await expect(page.getByRole("contentinfo").getByRole("button", { name: "Cookie settings" })).toBeFocused();
  });

  test("closing the settings opened from the banner returns focus to the banner", async ({ page }) => {
    await page.goto("/en");
    const banner = page.getByRole("region", { name: "Cookies on this website" });
    await banner.getByRole("button", { name: "Customise" }).click();
    await expect(page.getByRole("dialog", { name: "Cookie settings" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Cookie settings" })).toBeHidden();
    await expect(banner.getByRole("button", { name: "Customise" })).toBeFocused();
  });

  test("no third-party requests are made before a consent choice", async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    // Error monitoring (Sentry) is a processor for the site itself, not optional tracking; CI
    // builds with a fake DSN whose envelopes are intercepted here so nothing leaves the runner.
    const sentryHost = process.env.NEXT_PUBLIC_SENTRY_DSN
      ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).host
      : null;
    // The site's own Supabase Storage serves its photos (the homepage shows tour images from
    // Phase 3): first-party content, not tracking.
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null;
    await page.route("**/api/*/envelope/**", (route) => route.fulfill({ status: 200, body: "{}" }));
    const thirdParty: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (["data:", "blob:"].includes(url.protocol)) return;
      if (url.origin === origin || url.host === sentryHost || url.host === supabaseHost) return;
      thirdParty.push(request.url());
    });
    await page.goto("/en");
    await expect(page.getByRole("region", { name: "Cookies on this website" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(thirdParty).toEqual([]);
  });
});

test.describe("site shell (tablet)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("uses the menu sheet and keeps the language switcher in the header", async ({ page }) => {
    await dismissConsent(page);
    await page.goto("/en");
    const header = page.getByRole("banner");
    await expect(header.getByRole("navigation", { name: "Language" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
    await header.getByRole("button", { name: "Open menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect(sheet.getByRole("link", { name: "About" })).toHaveAttribute("href", "/en/about");
    await page.keyboard.press("Escape");
    await expect(header.getByRole("button", { name: "Open menu" })).toBeFocused();
  });

  test("only the header offers a Language landmark", async ({ page }) => {
    await dismissConsent(page);
    await page.goto("/en");
    await expect(page.getByRole("navigation", { name: "Language" })).toHaveCount(1);
    // The footer copy is a plain group, not a second landmark.
    await expect(page.getByRole("contentinfo").getByRole("group", { name: "Language" })).toBeVisible();
  });

  test("footer shows the settings it has and leaves out empty groups", async ({ page }) => {
    await dismissConsent(page);
    await page.goto("/en");
    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("Office address (sample)");
    // The seed has no legal details yet: no empty list is rendered for them.
    await expect(footer.locator("ul:empty, dl")).toHaveCount(0);
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
    // Radix has no trigger here (the sheet loads on demand): focus must still return.
    await expect(page.getByRole("button", { name: "Mở menu" })).toBeFocused();
  });

  test("the floating contact steps aside while the cookie banner is open", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("region", { name: "Cookies on this website" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Quick contact" })).toBeHidden();
    await page.getByRole("button", { name: "Essential only" }).click();
    await expect(page.getByRole("navigation", { name: "Quick contact" })).toBeVisible();
  });
});
