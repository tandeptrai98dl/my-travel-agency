import { expect, type Page, test } from "@playwright/test";

import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";

// Departures admin (docs/specs/phase-2-catalog-admin.md steps 14–16, ADR-024, ADR-026). Runs against
// local Supabase with the seed in CI. The seed gives every group tour a departure every two weeks
// from day 14 to day 182 (supabase/seed.sql).

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const dmy = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
// Far enough out to miss the seed (day 182 at most), and random so that a retry, which keeps the
// rows of the failed attempt, almost never meets its own dates.
const offset = 300 + Math.floor(Math.random() * 220);
const fresh = [iso(offset), iso(offset + 7)];
const seeded = iso(14);

async function openDepartures(page: Page) {
  await page
    .getByRole("navigation", { name: "Điều hướng quản trị" })
    .getByRole("link", { name: "Lịch khởi hành", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Lịch khởi hành" })).toBeVisible();
}

const toasts = (page: Page) => page.getByRole("region", { name: /^Thông báo/ });

test.describe("departures admin", () => {
  test.skip(!process.env.SEED_USER_PASSWORD, "needs the seeded staff accounts (CI)");
  test.describe.configure({ mode: "serial" });

  test("operator bulk-creates departures, edits one and deletes it", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAs(page, "operator");
    await openDepartures(page);
    const table = page.getByRole("table", { name: "Lịch khởi hành" });
    await expect(table.getByText("VN-HLB-03").first()).toBeVisible();
    // Seats are shown as reserved / capacity, never as an input.
    await expect(table.getByText(/^Đã giữ 0 trên \d+ chỗ$/).first()).toBeAttached();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    await expectNoSeriousViolations(page, "/admin/departures");

    // Bulk creation: two new dates and one the tour already has.
    await page.getByRole("link", { name: "Thêm ngày khởi hành" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Thêm ngày khởi hành" })).toBeVisible();
    await page.getByRole("combobox", { name: "Tour" }).click();
    await page.getByRole("option", { name: /^VN-NTH-06/ }).click();
    await expect(page.getByText(/^Tour 6 ngày/)).toBeVisible();
    // Operators see the copied prices, not price fields (ADR-016).
    await expect(page.getByText(/^Giá được lấy từ chuyến khởi hành gần nhất/)).toBeVisible();
    await expect(page.getByLabel("Giá người lớn (đồng)")).toHaveCount(0);
    await page.getByRole("radio", { name: "Danh sách ngày" }).check();
    await page.getByLabel("Ngày khởi hành", { exact: true }).fill([seeded, dmy(fresh[0]), fresh[1]].join("\n"));
    await page.getByLabel("Ghi chú (hiển thị cho khách)").fill(`E2E ${offset}`);
    await expectNoSeriousViolations(page, "/admin/departures/new");
    await page.getByRole("button", { name: "Xem trước" }).click();

    const preview = page.getByRole("table", { name: "Xem trước: VN-NTH-06" });
    await expect(preview.getByRole("row")).toHaveCount(4);
    await expect(preview.getByRole("row").filter({ hasText: "Đã có, bỏ qua" })).toHaveCount(1);
    await expect(page.getByText("Sẽ tạo 2 chuyến; bỏ qua 1 ngày đã có.")).toBeVisible();
    await expectNoSeriousViolations(page, "bulk creation preview");
    // A change after the preview hides it until the next preview.
    await page.getByLabel("Ghi chú (hiển thị cho khách)").fill(`E2E ${offset} (sửa)`);
    await expect(page.getByText("Thông tin đã thay đổi sau lần xem trước.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Xem trước" }).click();
    await page.getByRole("button", { name: "Tạo 2 chuyến" }).click();
    await expect(page.getByText("Đã tạo 2 chuyến; bỏ qua 1 ngày đã có.")).toBeVisible();

    // The new departures are in the tour's list.
    await page.getByRole("link", { name: "Xem các chuyến của tour này" }).click();
    await expect(page).toHaveURL(/\/admin\/departures\?tour=[0-9a-f-]{36}$/);
    const row = table.getByRole("row").filter({ hasText: dmy(fresh[0]) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`E2E ${offset} (sửa)`);

    // Edit: status, capacity and note; cancelling is for admins only.
    await row.getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^VN-NTH-06 · ${dmy(fresh[0])}$`) })).toBeVisible();
    await expect(page.getByTestId("departure-seats")).toHaveText("0/14");
    await expect(page.getByText("Chỉ quản trị viên (đã xác thực hai lớp) sửa giá.", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Giá người lớn (đồng)" })).toHaveCount(0);
    await page.getByRole("combobox", { name: "Trạng thái" }).click();
    await expect(page.getByRole("option", { name: "Đã huỷ" })).toBeDisabled();
    await page.getByRole("option", { name: "Ngừng nhận khách" }).click();
    await expect(page.getByRole("listbox")).toBeHidden();
    // Role locators skip the previous page, which the router keeps hidden in the DOM.
    await page.getByRole("spinbutton", { name: "Sức chứa (chỗ)" }).fill("20");
    await page.getByRole("textbox", { name: "Ghi chú (hiển thị cho khách)" }).fill("Đóng sớm");
    await expectNoSeriousViolations(page, "departure editor");
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(toasts(page).getByText("Đã lưu chuyến khởi hành.")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("departure-seats")).toHaveText("0/20");
    await expect(page.getByRole("combobox", { name: "Trạng thái" })).toHaveText("Ngừng nhận khách");
    await expect(page.getByRole("textbox", { name: "Ghi chú (hiển thị cho khách)" })).toHaveValue("Đóng sớm");

    // Delete (no bookings, not the tour's last departure).
    await page.getByRole("button", { name: "Xoá chuyến" }).click();
    await page.getByRole("alertdialog", { name: "Xoá chuyến khởi hành này?" }).getByRole("button", { name: "Xoá" }).click();
    await expect(page).toHaveURL(/\/admin\/departures\?tour=[0-9a-f-]{36}$/);
    await expect(toasts(page).getByText("Đã xoá chuyến khởi hành.")).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: dmy(fresh[0]) })).toHaveCount(0);
    await expect(table.getByRole("row").filter({ hasText: dmy(fresh[1]) })).toHaveCount(1);
  });

  test("the calendar shows a month and moves between months", async ({ page }) => {
    await signInAs(page, "operator");
    await openDepartures(page);
    await page.getByRole("navigation", { name: "Kiểu xem" }).getByRole("link", { name: "Lịch" }).click();
    await expect(page).toHaveURL(/view=calendar/);
    await expect(page.getByRole("navigation", { name: "Kiểu xem" }).getByRole("link", { name: "Lịch" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const month = page.getByRole("heading", { level: 2, name: /^Tháng \d{1,2}\/\d{4}$/ });
    const first = await month.textContent();
    await expect(page.getByRole("table", { name: `Lịch khởi hành ${first}` })).toBeVisible();
    await expectNoSeriousViolations(page, "/admin/departures calendar");
    await page.getByRole("link", { name: "Tháng sau" }).click();
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
    await expect(month).not.toHaveText(first ?? "");
    // The seed has departures every two weeks for six months, so next month has some.
    await expect(page.getByRole("table", { name: /^Lịch khởi hành/ }).getByRole("link").first()).toBeVisible();
  });

  test("sales read departures but cannot create or edit", async ({ page }) => {
    await signInAs(page, "sales");
    await openDepartures(page);
    const table = page.getByRole("table", { name: "Lịch khởi hành" });
    await expect(table.getByText("VN-HLB-03").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Thêm ngày khởi hành" })).toHaveCount(0);
    // Only the sortable column headers are links; no row links to the editor.
    await expect(table.locator("tbody").getByRole("link")).toHaveCount(0);
    await page.goto("/admin/departures/new");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});
