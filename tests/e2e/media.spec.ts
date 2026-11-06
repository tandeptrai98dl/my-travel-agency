import { expect, type Page, test } from "@playwright/test";

import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";

// Media library (docs/specs/phase-2-catalog-admin.md steps 5–7, decision 6). Runs against local
// Supabase Storage in CI.

// A real 1×1 PNG, and an SVG pretending to be one.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const FAKE_PNG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

async function upload(page: Page, name: string, buffer: Buffer) {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "image/png", buffer });
}

test.describe("media library", () => {
  test.skip(!process.env.SEED_USER_PASSWORD, "needs the seeded staff accounts (CI)");
  // One editor works through the whole flow; the steps depend on each other.
  test.describe.configure({ mode: "serial" });

  test("editor uploads, describes and deletes an image; disguised files are refused", async ({ page }) => {
    test.setTimeout(60_000);
    await signInAs(page, "editor");
    await page.getByRole("navigation", { name: "Điều hướng quản trị" }).getByRole("link", { name: "Thư viện ảnh" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Thư viện ảnh" })).toBeVisible();
    await expectNoSeriousViolations(page, "/admin/media");

    // An SVG renamed .png passes the browser's type check but not the server's byte check.
    await upload(page, "evil.png", FAKE_PNG);
    const progress = page.getByRole("region", { name: "Tiến trình tải lên" });
    await expect(progress.getByText("Không tải được evil.png: chỉ nhận JPEG, PNG, WebP hoặc AVIF")).toBeVisible();

    // A real image is recorded with its size and a small-image warning.
    await upload(page, "vinh-ha-long.png", PNG);
    await expect(progress.getByText("Đã tải vinh-ha-long.png")).toBeVisible();
    const card = page.getByRole("button", { name: /^Sửa ảnh:/ }).first();
    await expect(card).toContainText("Thiếu mô tả");
    await expect(card).toContainText("Ảnh nhỏ hơn 2400 px");
    // Only the server's re-encoded copy is public, at a server-generated path (ADR-023).
    await expect(card.locator("img")).toHaveAttribute(
      "src",
      /\/storage\/v1\/object\/public\/media\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/,
    );

    // Search by the file name as uploaded.
    const search = page.getByRole("searchbox", { name: "Tìm theo mô tả hoặc tên tệp" });
    await search.fill("vinh-ha-long");
    await page.getByRole("button", { name: "Lọc" }).click();
    await expect(page).toHaveURL(/q=vinh-ha-long/);
    await expect(card).toBeVisible();

    // Alt text in both languages.
    await card.click();
    const dialog = page.getByRole("dialog", { name: "Thông tin ảnh" });
    await expect(dialog).toContainText("1 × 1 px");
    await dialog.getByLabel("Mô tả ảnh (tiếng Việt)").fill("Thuyền buồm trên vịnh Hạ Long lúc bình minh");
    await dialog.getByLabel("Mô tả ảnh (tiếng Anh)").fill("A junk boat on Ha Long Bay at sunrise");
    await expectNoSeriousViolations(page, "media dialog", "[role=dialog]");
    await dialog.getByRole("button", { name: "Lưu" }).click();
    await expect(dialog).toBeHidden();
    const described = page.getByRole("button", { name: "Sửa ảnh: Thuyền buồm trên vịnh Hạ Long lúc bình minh" });
    await expect(described).toBeVisible();
    await expect(described).not.toContainText("Thiếu mô tả");

    // Search by alt text.
    await search.fill("bình minh");
    await page.getByRole("button", { name: "Lọc" }).click();
    await expect(page).toHaveURL(/q=b%C3%ACnh/);
    await expect(described).toBeVisible();

    // Delete (nothing uses it yet).
    await described.click();
    await page.getByRole("dialog", { name: "Thông tin ảnh" }).getByRole("button", { name: "Xoá ảnh" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Xoá ảnh này?" });
    await confirm.getByRole("button", { name: "Xoá ảnh" }).click();
    await expect(page.getByRole("region", { name: /^Thông báo/ }).getByText("Đã xoá ảnh")).toBeVisible();
    await expect(described).toHaveCount(0);
    // The card (and the dialog's trigger) is gone, so focus moves to the page, not the body.
    await expect(page.locator("#admin-main")).toBeFocused();
  });

  test("the media picker selects images and can upload inline", async ({ page }) => {
    test.skip(process.env.SHOW_DESIGN_SYSTEM !== "true", "the picker demo lives on the design system page");
    await signInAs(page, "editor");
    await page.goto("/admin/design-system");
    await page.getByRole("button", { name: "Mở thư viện ảnh" }).click();
    const picker = page.getByRole("dialog", { name: "Chọn ảnh" });
    await picker.locator('input[type="file"]').setInputFiles({ name: "picker.png", mimeType: "image/png", buffer: PNG });
    // Uploaded images are selected straight away.
    const selected = picker.getByRole("button", { pressed: true });
    await expect(selected).toHaveCount(1);
    await expectNoSeriousViolations(page, "media picker", "[role=dialog]");
    await picker.getByRole("button", { name: "Chọn 1 ảnh" }).click();
    await expect(picker).toBeHidden();
    await expect(page.getByTestId("picker-result")).toHaveText("Đã chọn 1 ảnh");
  });

  test("roles without media rights see no media library", async ({ page }) => {
    await signInAs(page, "operator");
    await expect(
      page.getByRole("navigation", { name: "Điều hướng quản trị" }).getByRole("link", { name: "Thư viện ảnh" }),
    ).toHaveCount(0);
    await page.goto("/admin/media");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    // The Server Actions refuse them too (RLS on Storage and the table is the second layer).
  });
});
