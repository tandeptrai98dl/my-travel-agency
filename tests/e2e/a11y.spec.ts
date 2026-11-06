import { expect, type Page, test } from "@playwright/test";

import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";

// Phase 1 acceptance (docs/specs/phase-1-design-system.md step 14): no serious or critical axe
// violations against WCAG 2.2 AA on the public shell and the design system page.
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

  test("admin form blocks: slug, money, list editor, confirm", async ({ page }) => {
    await signInAs(page, "editor");
    await page.goto("/admin/design-system");
    const blocks = page.getByRole("region", { name: "Khối nhập liệu quản trị" });

    // Slug from the Vietnamese title, diacritics removed.
    await blocks.getByRole("button", { name: "Tạo từ tiêu đề" }).click();
    await expect(blocks.getByRole("textbox", { name: "Đường dẫn (slug)" })).toHaveValue("vinh-ha-long-tren-du-thuyen-rieng");

    // Money: grouped input is read exactly; a decimal amount is refused (empty value).
    const price = blocks.getByRole("textbox", { name: "Giá người lớn (VND)" });
    await price.fill("12.900.000");
    await price.blur();
    await expect(price).toHaveValue("12.900.000");

    // List editor: moving a line keeps focus on it and announces the move.
    await blocks.getByRole("button", { name: "Chuyển dòng 2 xuống" }).click();
    await expect(blocks.getByRole("textbox", { name: "Dòng 3" })).toHaveValue("Bữa tối hải sản riêng");
    await expect(blocks.getByRole("button", { name: "Chuyển dòng 3 lên" })).toBeFocused();
    await expect(blocks.getByText("Đã chuyển dòng 2 đến vị trí 3")).toBeAttached();
    // Removing a line moves focus to its neighbour.
    await blocks.getByRole("button", { name: "Xoá dòng 1" }).click();
    await expect(blocks.getByRole("textbox", { name: "Dòng 1" })).toBeFocused();

    // Confirm dialog for destructive actions.
    await blocks.getByRole("button", { name: "Xoá tour mẫu" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Xoá tour này?" });
    await expect(dialog).toBeVisible();
    await expectNoSeriousViolations(page, "confirm dialog", "[role=alertdialog]");
    await dialog.getByRole("button", { name: "Huỷ" }).click();
    await expect(dialog).toBeHidden();
    await expectNoSeriousViolations(page, "admin form blocks");
  });

  test("customers cannot open it", async ({ page }) => {
    await signInAs(page, "customer");
    await page.goto("/admin/design-system");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});
