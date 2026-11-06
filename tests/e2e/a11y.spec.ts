import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { signInAs } from "./support/auth";

// Phase 1 acceptance (docs/specs/phase-1-design-system.md step 14): no serious or critical axe
// violations against WCAG 2.2 AA on the public shell and the design system page.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Radix NavigationMenu inserts an aria-hidden, focusable sentinel after an open trigger. It never
// keeps focus: on Tab it moves focus into the menu content (or past it). axe reports it as
// aria-hidden-focus; it is excluded here by its exact shape and recorded in PROGRESS.md.
const RADIX_FOCUS_PROXY = 'li > button[aria-expanded="true"] + span[aria-hidden="true"][tabindex="0"]';

/**
 * `within` scopes the check to an open overlay: Radix marks everything outside a modal
 * aria-hidden while focus is trapped inside, which axe reports as aria-hidden-focus on the page
 * behind it. The page itself is checked separately with the overlay closed.
 */
async function expectNoSeriousViolations(page: Page, label: string, within?: string) {
  // Colour contrast is meaningless mid-fade: let open/close animations finish first.
  // (Looping animations such as the spinner never finish and are ignored.)
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
  let builder = new AxeBuilder({ page }).withTags(TAGS).exclude(RADIX_FOCUS_PROXY);
  if (within) builder = builder.include(within);
  const results = await builder.analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, `${label}: ${summary.join("\n")}`).toEqual([]);
}

async function dismissConsent(page: Page) {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("baseURL is not configured");
  await page.context().addCookies([{ name: "consent", value: "v1.a0.m0", url }]);
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 860 },
  { name: "mobile", width: 375, height: 812 },
]) {
  test.describe(`axe (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const path of ["/", "/en", "/en/does-not-exist"]) {
      test(`${path} with the cookie banner open`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("region", { name: /cookie/i })).toBeVisible();
        await expectNoSeriousViolations(page, path);
      });
    }

    test("home after a consent choice, header over the hero and scrolled", async ({ page }) => {
      await dismissConsent(page);
      await page.goto("/en");
      await expect(page.getByRole("region", { name: /cookie/i })).toBeHidden();
      const header = page.getByRole("banner");
      // Transparent over the navy hero first…
      await expect(header).toHaveClass(/theme-navy/);
      await expectNoSeriousViolations(page, "/en header over the hero");
      // …then solid once the page scrolls.
      await page.mouse.wheel(0, 600);
      await expect(header).not.toHaveClass(/theme-navy/);
      await expect(header).toHaveClass(/border-b/);
      await expectNoSeriousViolations(page, "/en scrolled");
    });

    test("cookie settings dialog", async ({ page }) => {
      await page.goto("/en");
      await page.getByRole("button", { name: "Customise" }).click();
      await expect(page.getByRole("dialog", { name: "Cookie settings" })).toBeVisible();
      await expectNoSeriousViolations(page, "cookie settings");
    });
  });
}

test("mobile menu sheet", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await dismissConsent(page);
  await page.goto("/en");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  await expectNoSeriousViolations(page, "mobile menu");
});

test("desktop mega menu", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await dismissConsent(page);
  await page.goto("/en/does-not-exist");
  const trigger = page.getByRole("button", { name: "Destinations" });
  await trigger.click();
  await expectNoSeriousViolations(page, "mega menu");
  // The excluded sentinel only forwards focus: Tab from the trigger lands on a destination link.
  await trigger.focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("href", /\/en\/destinations\//);
});

test.describe("design system page", () => {
  test.skip(!process.env.SEED_USER_PASSWORD, "needs the seeded staff accounts (CI)");
  test.skip(process.env.SHOW_DESIGN_SYSTEM !== "true", "built without SHOW_DESIGN_SYSTEM=true");

  test("staff see every component with no serious violations", async ({ page }) => {
    await signInAs(page, "editor");
    await page.goto("/admin/design-system");
    await expect(page.getByRole("heading", { level: 1, name: "Hệ thống thiết kế" })).toBeVisible();
    await expectNoSeriousViolations(page, "/admin/design-system");

    // Form errors are linked to their fields; a field without a description points only at
    // its error message.
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    const name = page.getByLabel("Họ và tên");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAccessibleDescription("Vui lòng nhập thông tin này.");
    await expect(page.getByLabel("Lời nhắn")).toHaveAccessibleDescription(
      "Kể cho chúng tôi về chuyến đi bạn mơ ước.",
    );
    await expectNoSeriousViolations(page, "/admin/design-system with errors");

    // Portalled Radix content: the select list, a dialog and a toast.
    await page.getByRole("combobox", { name: "Điểm đến" }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await expectNoSeriousViolations(page, "select open", "[role=listbox]");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Mở hộp thoại" }).click();
    await expect(page.getByRole("dialog", { name: "Xác nhận" })).toBeVisible();
    await expectNoSeriousViolations(page, "dialog open", "[role=dialog]");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    // A confirmation toast closes by itself; an error toast stays until it is closed.
    await page.getByRole("button", { name: "Hiện thông báo" }).click();
    const toasts = page.getByRole("region", { name: /^Thông báo/ }).getByRole("listitem");
    await expect(toasts.filter({ hasText: "Đã lưu thay đổi" })).toBeVisible();
    await page.getByRole("button", { name: "Hiện lỗi" }).click();
    const errorToast = toasts.filter({ hasText: "Không lưu được" });
    await expect(errorToast).toBeVisible();
    await expectNoSeriousViolations(page, "toast visible");
    await errorToast.getByRole("button", { name: "Đóng" }).click();
    await expect(errorToast).toBeHidden();
  });

  test("customers cannot open it", async ({ page }) => {
    await signInAs(page, "customer");
    await page.goto("/admin/design-system");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});
