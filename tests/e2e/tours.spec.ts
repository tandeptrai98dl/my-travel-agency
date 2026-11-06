import { expect, type Page, test } from "@playwright/test";

import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";

// Tours admin (docs/specs/phase-2-catalog-admin.md steps 12–13, ADR-024). Runs against local
// Supabase with the seed in CI.

const run = Date.now().toString(36).toUpperCase().slice(-5);

async function openTours(page: Page) {
  await page.getByRole("navigation", { name: "Điều hướng quản trị" }).getByRole("link", { name: "Tour", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tour" })).toBeVisible();
}

test.describe("tours admin", () => {
  test.skip(!process.env.SEED_USER_PASSWORD, "needs the seeded staff accounts (CI)");
  test.describe.configure({ mode: "serial" });

  test("editor filters the list, creates a draft and meets the publish rules", async ({ page }) => {
    test.setTimeout(90_000);
    await signInAs(page, "editor");
    await openTours(page);
    const table = page.getByRole("table", { name: "Tour" });
    await expect(table.getByText("VN-HLB-03")).toBeVisible();
    await expectNoSeriousViolations(page, "/admin/tours");
    await page.getByLabel("Trạng thái", { exact: true }).selectOption("draft");
    await page.getByRole("button", { name: "Lọc" }).click();
    await expect(page).toHaveURL(/status=draft/);
    await expect(table.getByText("VN-PQC-04")).toBeVisible();
    await expect(table.getByText("VN-HLB-03")).toHaveCount(0);

    // A new draft from the short form.
    await page.goto("/admin/tours/new");
    await page.getByLabel("Tên tour (tiếng Việt)").fill(`Tour thử ${run}`);
    await page.getByLabel("Mã tour").fill(`E2E-${run}`);
    await page.getByRole("button", { name: "Tạo bản nháp" }).click();
    await expect(page).toHaveURL(/\/admin\/tours\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: `Tour thử ${run}` })).toBeVisible();
    // Prices are read-only for editors (ADR-024).
    await expect(page.getByText("Chỉ quản trị viên (đã xác thực hai lớp) sửa giá và điều khoản.")).toBeVisible();
    await expect(page.getByLabel("Giá từ (đồng)")).toHaveCount(0);
    await expectNoSeriousViolations(page, "tour editor");

    // Content: a summary and one itinerary day.
    const vi = page.getByRole("tabpanel", { name: /^Tiếng Việt/ });
    await vi.getByLabel("Tóm tắt", { exact: true }).fill("Một chuyến thử nghiệm ngắn.");
    await vi.getByRole("button", { name: "Thêm ngày" }).click();
    await vi.getByLabel("Tiêu đề ngày 1").fill("Khởi hành");
    await vi.getByLabel("Trưa").check();

    // Publishing without a hero and a published language is refused, with the reasons shown.
    await page.getByRole("combobox", { name: "Trạng thái" }).click();
    await page.getByRole("option", { name: "Đã xuất bản" }).click();
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByText("Cần ít nhất một ngôn ngữ đã xuất bản.")).toBeVisible();
    await expect(page.getByText("Cần ảnh đại diện có mô tả tiếng Việt và tiếng Anh.")).toBeVisible();

    // Saved as a draft instead.
    await page.getByRole("combobox", { name: "Trạng thái" }).click();
    await page.getByRole("option", { name: "Nháp" }).click();
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByRole("region", { name: /^Thông báo/ }).getByText("Đã lưu")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("tabpanel", { name: /^Tiếng Việt/ }).getByLabel("Tiêu đề ngày 1")).toHaveValue("Khởi hành");
  });

  test("editor duplicates a published tour as a draft", async ({ page }) => {
    await signInAs(page, "editor");
    await openTours(page);
    await page.getByRole("link", { name: "Du thuyền vịnh Hạ Long" }).click();
    await page.getByRole("button", { name: "Nhân bản" }).click();
    const dialog = page.getByRole("dialog", { name: "Nhân bản tour này?" });
    await dialog.getByLabel("Mã cho bản sao").fill(`HLB-${run}`);
    await dialog.getByRole("button", { name: "Nhân bản" }).click();
    await expect(page).toHaveURL(/\/admin\/tours\/[0-9a-f-]{36}$/);
    await expect(page.getByText(`HLB-${run}`, { exact: true })).toBeVisible();
    await expect(page.getByText("Nháp", { exact: true }).first()).toBeVisible();
  });

  test("operators read the tour list but cannot edit", async ({ page }) => {
    await signInAs(page, "operator");
    await openTours(page);
    await expect(page.getByRole("table", { name: "Tour" }).getByText("VN-HLB-03")).toBeVisible();
    await expect(page.getByRole("link", { name: "Thêm tour" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Du thuyền vịnh Hạ Long" })).toHaveCount(0);
    await page.goto("/admin/tours/new");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});
