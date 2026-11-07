import { expect, type Page, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";

// Review moderation (docs/specs/phase-2-catalog-admin.md step 19). Reviews are created with the
// service role, as post-trip reviews will be (P1); the seed has none.

const run = Date.now().toString(36).slice(-5);
const author = `Khách E2E ${run}`;

const card = (page: Page) => page.getByTestId("review").filter({ hasText: author });
const toasts = (page: Page) => page.getByRole("region", { name: /^Thông báo/ });

test.describe("reviews admin", () => {
  test.skip(!process.env.SEED_USER_PASSWORD, "needs the seeded staff accounts (CI)");
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const { error } = await adminApi()
      .from("reviews")
      .insert({ author_name: author, author_country: "Việt Nam", rating: 4, title: "Vịnh lặng gió", content: "Một đêm trên vịnh rất yên bình.", locale: "vi", is_verified: true });
    if (error) throw error;
  });

  test("editor approves, features and rejects a review; the verified flag stays read-only", async ({ page }) => {
    await signInAs(page, "editor");
    await page.getByRole("navigation", { name: "Điều hướng quản trị" }).getByRole("link", { name: "Đánh giá", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Đánh giá" })).toBeVisible();
    await expect(card(page)).toContainText("Chờ duyệt");
    await expect(card(page)).toContainText("Đã xác minh");
    await expect(card(page).getByText("4 trên 5 sao")).toBeAttached();
    await expectNoSeriousViolations(page, "/admin/reviews");

    await card(page).getByRole("button", { name: "Duyệt" }).click();
    await expect(toasts(page).getByText("Đã duyệt đánh giá")).toBeVisible();
    await expect(card(page)).toContainText("Đã duyệt");
    await card(page).getByRole("button", { name: "Nổi bật" }).click();
    await expect(card(page).getByRole("button", { name: "Nổi bật" })).toHaveAttribute("aria-pressed", "true");

    // Rejecting a featured review unfeatures it.
    await card(page).getByRole("button", { name: "Từ chối" }).click();
    await expect(card(page)).toContainText("Đã từ chối");
    await expect(card(page).getByRole("button", { name: "Nổi bật" })).toHaveCount(0);

    // Filters live in the URL.
    await page.getByLabel("Trạng thái", { exact: true }).selectOption("pending");
    await page.getByRole("button", { name: "Lọc" }).click();
    await expect(page).toHaveURL(/status=pending/);
    await expect(card(page)).toHaveCount(0);
  });

  test("operators cannot moderate reviews", async ({ page }) => {
    await signInAs(page, "operator");
    await page.goto("/admin/reviews");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});
