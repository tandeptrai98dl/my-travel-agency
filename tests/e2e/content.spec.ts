import { expect, type Page, test } from "./support/test";

import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";

// Journal, topics and static pages (docs/specs/phase-2-catalog-admin.md steps 17–18). Runs against
// local Supabase with the seed in CI.

const run = Date.now().toString(36).slice(-5);
const menu = (page: Page) => page.getByRole("navigation", { name: "Điều hướng quản trị" });
const panel = (page: Page, language: string) => page.getByRole("tabpanel", { name: new RegExp(`^${language}`) });
const toasts = (page: Page) => page.getByRole("region", { name: /^Thông báo/ });

async function chooseStatus(page: Page, status: string) {
  await page.getByRole("combobox", { name: "Trạng thái" }).click();
  await page.getByRole("option", { name: status, exact: true }).click();
  await expect(page.getByRole("listbox")).toBeHidden();
}

test.describe("content admin", () => {
  test.skip(!process.env.SEED_USER_PASSWORD, "needs the seeded staff accounts (CI)");
  test.describe.configure({ mode: "serial" });

  test("editor writes an article with rich text, meets the publish rules and deletes it", async ({ page }) => {
    test.setTimeout(90_000);
    await signInAs(page, "editor");
    await menu(page).getByRole("link", { name: "Tạp chí", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Tạp chí" })).toBeVisible();
    await expectNoSeriousViolations(page, "/admin/journal");

    await page.getByRole("link", { name: "Viết bài" }).click();
    const vi = panel(page, "Tiếng Việt");
    await vi.getByLabel("Tiêu đề", { exact: true }).fill(`Một ngày ở Hội An ${run}`);
    await vi.getByRole("button", { name: "Tạo từ tiêu đề" }).click();
    await expect(vi.getByLabel("Đường dẫn (slug)")).toHaveValue(`mot-ngay-o-hoi-an-${run}`);

    // Rich text: a heading, bold text and a link through the toolbar.
    const editor = vi.getByRole("textbox", { name: "Nội dung" });
    await editor.click();
    await vi.getByRole("button", { name: "Tiêu đề mục" }).click();
    await page.keyboard.type("Buổi sáng");
    await page.keyboard.press("Enter");
    await vi.getByRole("button", { name: "In đậm" }).click();
    await expect(vi.getByRole("button", { name: "In đậm" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.type("Cà phê bên sông");
    await page.keyboard.press("Shift+Home");
    await vi.getByRole("button", { name: "Liên kết" }).click();
    const linkDialog = page.getByRole("dialog", { name: "Liên kết" });
    await linkDialog.getByLabel("Địa chỉ liên kết").fill("javascript:alert(1)");
    await linkDialog.getByRole("button", { name: "Áp dụng" }).click();
    await expect(linkDialog.getByText("Địa chỉ không hợp lệ hoặc không an toàn.")).toBeVisible();
    await expectNoSeriousViolations(page, "link dialog", '[role="dialog"]');
    await linkDialog.getByLabel("Địa chỉ liên kết").fill("/tours");
    await linkDialog.getByRole("button", { name: "Áp dụng" }).click();
    await expect(editor.locator("h2")).toHaveText("Buổi sáng");
    await expect(editor.locator('strong a[href="/tours"], a[href="/tours"] strong')).toHaveText("Cà phê bên sông");
    await expectNoSeriousViolations(page, "article editor");

    // Publishing needs a cover, an SEO description and a published language.
    await vi.getByLabel("Xuất bản bản tiếng Việt").click();
    await chooseStatus(page, "Đã xuất bản");
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Vui lòng sửa các trường được đánh dấu." })).toBeVisible();
    await expect(page.getByText("Cần ảnh bìa có mô tả tiếng Việt và tiếng Anh.")).toBeVisible();
    await expect(vi.getByText("Cần có trước khi xuất bản.")).toBeVisible();

    // Saved as a draft instead; the text survives a reload.
    await vi.getByLabel("Xuất bản bản tiếng Việt").click();
    await chooseStatus(page, "Nháp");
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/journal\/[0-9a-f-]{36}$/);
    await expect(toasts(page).getByText("Đã lưu")).toBeVisible();
    await page.reload();
    const saved = panel(page, "Tiếng Việt").getByRole("textbox", { name: "Nội dung" });
    await expect(saved.locator("h2")).toHaveText("Buổi sáng");
    await expect(saved.locator('a[href="/tours"]')).toHaveText("Cà phê bên sông");

    // The list finds it by title; then it is deleted.
    await page.goto(`/admin/journal?q=${run}`);
    await expect(page.getByRole("table", { name: "Tạp chí" }).getByRole("link", { name: `Một ngày ở Hội An ${run}` })).toBeVisible();
    await page.getByRole("table", { name: "Tạp chí" }).getByRole("link", { name: `Một ngày ở Hội An ${run}` }).click();
    await page.getByRole("button", { name: "Xoá" }).click();
    await page.getByRole("alertdialog", { name: "Xoá bài viết này?" }).getByRole("button", { name: "Xoá" }).click();
    await expect(page).toHaveURL(/\/admin\/journal$/);
    await expect(toasts(page).getByText("Đã xoá")).toBeVisible();
  });

  test("editor creates and deletes a topic", async ({ page }) => {
    await signInAs(page, "editor");
    await page.goto("/admin/journal/categories");
    await expect(page.getByRole("heading", { level: 1, name: "Chủ đề" })).toBeVisible();
    await page.getByRole("link", { name: "Thêm chủ đề" }).click();
    await page.getByLabel("Tên chủ đề (Tiếng Việt)").fill(`Ẩm thực ${run}`);
    await page.getByRole("button", { name: "Tạo từ tiêu đề" }).first().click();
    await expect(page.getByLabel("Đường dẫn (Tiếng Việt)")).toHaveValue(`am-thuc-${run}`);
    await expectNoSeriousViolations(page, "topic form");
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/journal\/categories$/);
    const list = page.getByRole("list", { name: "Chủ đề" });
    await list.getByRole("link", { name: `Ẩm thực ${run}` }).click();
    await page.getByRole("button", { name: "Xoá" }).click();
    await page.getByRole("alertdialog", { name: "Xoá chủ đề này?" }).getByRole("button", { name: "Xoá" }).click();
    await expect(page).toHaveURL(/\/admin\/journal\/categories$/);
    await expect(page.getByRole("list", { name: "Chủ đề" }).getByRole("link", { name: `Ẩm thực ${run}` })).toHaveCount(0);
  });

  test("editor publishes the Vietnamese terms page", async ({ page }) => {
    await signInAs(page, "editor");
    await menu(page).getByRole("link", { name: "Trang tĩnh", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Trang tĩnh" })).toBeVisible();
    await expectNoSeriousViolations(page, "/admin/pages");
    await page.getByRole("list", { name: "Trang tĩnh" }).getByRole("link", { name: "Điều khoản sử dụng" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Điều khoản sử dụng" })).toBeVisible();

    const vi = panel(page, "Tiếng Việt");
    await vi.getByLabel("Tiêu đề", { exact: true }).fill("Điều khoản sử dụng");
    await vi.getByLabel("Đường dẫn (slug)").fill(`dieu-khoan-${run}`);
    await vi.getByRole("textbox", { name: "Nội dung" }).click();
    await page.keyboard.type("Khi đặt tour, bạn đồng ý với các điều khoản sau.");
    await vi.getByLabel("Mô tả SEO").fill("Điều khoản khi đặt tour.");
    await vi.getByLabel("Xuất bản bản tiếng Việt").click();
    await chooseStatus(page, "Đã xuất bản");
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(toasts(page).getByText("Đã lưu")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Trạng thái" })).toHaveText("Đã xuất bản");
    await expect(panel(page, "Tiếng Việt").getByRole("textbox", { name: "Nội dung" })).toContainText("Khi đặt tour");
  });

  test("operators have no content pages", async ({ page }) => {
    await signInAs(page, "operator");
    await expect(menu(page).getByRole("link", { name: "Tạp chí", exact: true })).toHaveCount(0);
    await page.goto("/admin/journal");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await page.goto("/admin/pages/terms");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});
