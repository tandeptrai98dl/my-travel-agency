import { readFile } from "node:fs/promises";

import { expect, type Page, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";

// Redirects and newsletter subscribers (docs/specs/phase-2-catalog-admin.md step 20). CI has no
// Upstash account, so the Redis sync is the logged no-op of decision 5.

const run = Date.now().toString(36).slice(-5);
const menu = (page: Page) => page.getByRole("navigation", { name: "Điều hướng quản trị" });
const toasts = (page: Page) => page.getByRole("region", { name: /^Thông báo/ });

test.describe("redirects and subscribers admin", () => {
  test.skip(!process.env.SEED_USER_PASSWORD, "needs the seeded staff accounts (CI)");
  test.describe.configure({ mode: "serial" });

  test("editor adds a redirect, is refused a chain and an outside target, and deletes it", async ({ page }) => {
    await signInAs(page, "editor");
    await menu(page).getByRole("link", { name: "Chuyển hướng", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Chuyển hướng" })).toBeVisible();
    await expect(page.getByText(/^Redis \(Upstash\) chưa được cấu hình/)).toBeVisible();
    await expectNoSeriousViolations(page, "/admin/redirects");

    const source = `/khuyen-mai-${run}`;
    await page.getByLabel("Từ địa chỉ").fill(`khuyen-mai-${run}/`);
    await page.getByLabel("Đến địa chỉ").fill("/tours");
    await page.getByRole("button", { name: "Thêm chuyển hướng" }).click();
    await expect(toasts(page).getByText("Đã thêm chuyển hướng")).toBeVisible();
    const table = page.getByRole("table", { name: "Chuyển hướng" });
    // The leading slash was added and the trailing one dropped.
    await expect(table.getByRole("row").filter({ hasText: source })).toContainText("/tours");

    // A redirect to a redirected path would chain; a full URL leaves the site.
    await page.getByLabel("Từ địa chỉ").fill(`/xuan-${run}`);
    await page.getByLabel("Đến địa chỉ").fill(source);
    await page.getByRole("button", { name: "Thêm chuyển hướng" }).click();
    await expect(page.getByText("Địa chỉ đích đang được chuyển hướng tiếp; hãy trỏ thẳng tới đích cuối.")).toBeVisible();
    await page.getByLabel("Đến địa chỉ").fill("https://example.com");
    await page.getByRole("button", { name: "Thêm chuyển hướng" }).click();
    await expect(page.getByText(/^Đường dẫn trên trang này, bắt đầu bằng \/ \(không dùng/)).toBeVisible();

    // Resync explains that Redis is not configured.
    await page.getByRole("button", { name: "Kiểm tra đồng bộ" }).click();
    await expect(toasts(page).getByText(/^Redis chưa được cấu hình: \d+ chuyển hướng/)).toBeVisible();

    await table.getByRole("button", { name: `Xoá chuyển hướng ${source}` }).click();
    await page.getByRole("alertdialog", { name: "Xoá chuyển hướng này?" }).getByRole("button", { name: "Xoá" }).click();
    await expect(toasts(page).getByText("Đã xoá chuyển hướng")).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: source })).toHaveCount(0);
  });

  test("editor reads subscribers and exports the active ones, and the export is audited", async ({ page }) => {
    const active = `doc-gia-${run}@example.test`;
    const gone = `da-huy-${run}@example.test`;
    const { error } = await adminApi()
      .from("subscribers")
      .insert([
        { email: active, locale: "vi", source: "footer", confirmed_at: new Date().toISOString() },
        { email: gone, locale: "en", source: "footer", confirmed_at: new Date().toISOString(), unsubscribed_at: new Date().toISOString() },
      ]);
    expect(error).toBeNull();

    await signInAs(page, "editor");
    await menu(page).getByRole("link", { name: "Bản tin", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Người nhận bản tin" })).toBeVisible();
    await page.getByLabel("Tìm theo email").fill(run);
    await page.getByRole("button", { name: "Lọc" }).click();
    const table = page.getByRole("table", { name: "Người nhận bản tin" });
    await expect(table.getByRole("row").filter({ hasText: active })).toContainText("Đang nhận");
    await expect(table.getByRole("row").filter({ hasText: gone })).toContainText("Đã huỷ");
    await expectNoSeriousViolations(page, "/admin/subscribers");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Xuất CSV" }).click();
    const file = await (await download).path();
    const csv = await readFile(file, "utf8");
    expect(csv).toContain(`"${active}"`);
    expect(csv).not.toContain(gone);
    await expect(toasts(page).getByText(/^Đã xuất \d+ người nhận\.$/)).toBeVisible();

    const { data: audit } = await adminApi()
      .from("audit_logs")
      .select("action, actor_id, changes")
      .eq("action", "subscribers.export")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(audit?.[0]?.actor_id).toBeTruthy();
  });

  test("operators have neither page", async ({ page }) => {
    await signInAs(page, "operator");
    for (const path of ["/admin/redirects", "/admin/subscribers"]) {
      await page.goto(path);
      await expect(page.getByText("This page could not be found.")).toBeVisible();
    }
  });
});
