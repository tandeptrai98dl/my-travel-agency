import { expect, type Locator, type Page, test } from "@playwright/test";

import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";

// Destinations, travel styles and cancellation policies (docs/specs/phase-2-catalog-admin.md
// steps 8–10). Runs against local Supabase with the seed in CI.

const run = Date.now().toString(36);

function panel(page: Page, language: "Tiếng Việt" | "Tiếng Anh"): Locator {
  return page.getByRole("tabpanel", { name: new RegExp(`^${language}`) });
}

async function fillVietnamese(page: Page, name: string, summary?: string) {
  const vi = panel(page, "Tiếng Việt");
  await vi.getByLabel("Tên", { exact: true }).fill(name);
  await vi.getByRole("button", { name: "Tạo từ tiêu đề" }).click();
  if (summary !== undefined) await vi.getByLabel("Tóm tắt", { exact: true }).fill(summary);
}

test.describe("taxonomy admin", () => {
  test.skip(!process.env.SEED_USER_PASSWORD, "needs the seeded staff accounts (CI)");
  test.describe.configure({ mode: "serial" });

  test("editor builds a country → region branch, with publish checks and safe deletes", async ({ page }) => {
    test.setTimeout(90_000);
    await signInAs(page, "editor");
    const menu = page.getByRole("navigation", { name: "Điều hướng quản trị" });
    await menu.getByRole("link", { name: "Điểm đến" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Điểm đến" })).toBeVisible();
    // The seeded tree is listed with nested levels.
    await expect(page.getByTestId("destination-row").first()).toBeVisible();
    await expectNoSeriousViolations(page, "/admin/destinations");

    // New country; publishing Vietnamese needs a summary (decision 3).
    await page.getByRole("link", { name: "Thêm điểm đến" }).click();
    await page.getByLabel("Khoá (key)").fill(`e2e-${run}`);
    await fillVietnamese(page, `Quốc gia ${run}`);
    await expect(panel(page, "Tiếng Việt").getByLabel("Đường dẫn (slug)")).toHaveValue(`quoc-gia-${run}`);
    await panel(page, "Tiếng Việt").getByLabel("Xuất bản bản tiếng Việt").click();
    await page.getByRole("button", { name: "Lưu" }).click();
    // (The Next.js route announcer is also role=alert.)
    await expect(page.getByRole("alert").filter({ hasText: "Vui lòng sửa các trường được đánh dấu." })).toBeVisible();
    await expect(panel(page, "Tiếng Việt")).toContainText("Cần có trước khi xuất bản.");
    await expect(page.getByRole("tab", { name: /^Tiếng Việt/ })).toContainText("Còn thiếu thông tin");
    await expectNoSeriousViolations(page, "destination form with errors");

    await panel(page, "Tiếng Việt").getByLabel("Tóm tắt", { exact: true }).fill("Một đất nước để thử nghiệm.");
    await page.getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByRole("region", { name: /^Thông báo/ }).getByText("Đã lưu")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/destinations\/[0-9a-f-]{36}$/);
    const countryUrl = page.url();

    // A region under it, started from the tree.
    await page.goto("/admin/destinations");
    await page.getByRole("link", { name: `Thêm vùng: Quốc gia ${run}` }).click();
    await expect(page.getByRole("combobox", { name: "Loại" })).toHaveText("Vùng");
    await expect(page.getByRole("combobox", { name: "Thuộc" })).toHaveText(`Quốc gia ${run}`);
    await page.getByLabel("Khoá (key)").fill(`e2e-${run}-vung`);
    await fillVietnamese(page, `Vùng ${run}`);
    await page.getByRole("button", { name: "Lưu" }).click();
    await expect(page).toHaveURL(/\/admin\/destinations\/[0-9a-f-]{36}$/);
    const regionUrl = page.url();

    // The country cannot go while the region uses it.
    await page.goto(countryUrl);
    await page.getByRole("button", { name: "Xoá" }).click();
    await page.getByRole("alertdialog", { name: "Xoá mục này?" }).getByRole("button", { name: "Xoá" }).click();
    await expect(page.getByRole("region", { name: /^Thông báo/ })).toContainText("Đang được tour hoặc mục con sử dụng");

    // Region first, then the country.
    for (const url of [regionUrl, countryUrl]) {
      await page.goto(url);
      await page.getByRole("button", { name: "Xoá" }).click();
      await page.getByRole("alertdialog", { name: "Xoá mục này?" }).getByRole("button", { name: "Xoá" }).click();
      await expect(page).toHaveURL(/\/admin\/destinations$/);
    }
    await expect(page.getByRole("link", { name: `Quốc gia ${run}`, exact: true })).toHaveCount(0);
  });

  test("editor creates a travel style; a slug in use is caught before saving", async ({ page }) => {
    await signInAs(page, "editor");
    await page.goto("/admin/travel-styles/new");
    await page.getByLabel("Khoá (key)").fill(`e2e-${run}`);
    const vi = panel(page, "Tiếng Việt");
    await vi.getByLabel("Tên", { exact: true }).fill(`Phong cách ${run}`);
    // The seed already uses /phong-cach/gia-dinh.
    await vi.getByLabel("Đường dẫn (slug)").fill("gia-dinh");
    await vi.getByLabel("Mô tả", { exact: true }).click();
    await expect(vi).toContainText("Đường dẫn này đã có nội dung khác dùng.");
    await vi.getByRole("button", { name: "Tạo từ tiêu đề" }).click();
    await vi.getByLabel("Mô tả", { exact: true }).fill("Chậm rãi, riêng tư.");
    await page.getByRole("button", { name: "Lưu" }).click();
    await expect(page).toHaveURL(/\/admin\/travel-styles\/[0-9a-f-]{36}$/);
    await expectNoSeriousViolations(page, "travel style editor");
    await page.goto("/admin/travel-styles");
    await expect(page.getByTestId("travel-style-row").filter({ hasText: `Phong cách ${run}` })).toBeVisible();
  });

  test("cancellation policies are admin-only; other roles see no catalog editors", async ({ page }) => {
    await signInAs(page, "editor");
    await expect(
      page.getByRole("navigation", { name: "Điều hướng quản trị" }).getByRole("link", { name: "Chính sách huỷ" }),
    ).toHaveCount(0);
    await page.goto("/admin/cancellation-policies");
    await expect(page.getByText("This page could not be found.")).toBeVisible();

    await signInAs(page, "operator");
    const menu = page.getByRole("navigation", { name: "Điều hướng quản trị" });
    await expect(menu.getByRole("link", { name: "Điểm đến" })).toHaveCount(0);
    await page.goto("/admin/destinations/new");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});
