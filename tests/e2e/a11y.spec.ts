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

async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).exclude(RADIX_FOCUS_PROXY).analyze();
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

    test("/en after a consent choice, header scrolled", async ({ page }) => {
      await dismissConsent(page);
      await page.goto("/en/does-not-exist");
      await page.mouse.wheel(0, 400);
      await expectNoSeriousViolations(page, "/en/does-not-exist scrolled");
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
  test.skip(!process.env.SHOW_DESIGN_SYSTEM, "built without SHOW_DESIGN_SYSTEM");

  test("staff see every component with no serious violations", async ({ page }) => {
    await signInAs(page, "editor");
    await page.goto("/admin/design-system");
    await expect(page.getByRole("heading", { level: 1, name: "Hệ thống thiết kế" })).toBeVisible();
    await expectNoSeriousViolations(page, "/admin/design-system");

    // Form errors are announced and linked to their fields.
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    const name = page.getByLabel("Họ và tên");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Vui lòng nhập thông tin này.").first()).toBeVisible();
    await expectNoSeriousViolations(page, "/admin/design-system with errors");

    // A toast appears in the notifications region and can be closed.
    await page.getByRole("button", { name: "Hiện thông báo" }).click();
    await expect(page.getByText("Đã lưu thay đổi").first()).toBeVisible();
  });

  test("customers cannot open it", async ({ page }) => {
    await signInAs(page, "customer");
    await page.goto("/admin/design-system");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});
