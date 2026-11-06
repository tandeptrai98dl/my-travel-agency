import { expect, test } from "@playwright/test";

import { magicLinkTokenHash } from "./support/admin-api";
import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";
import { totp } from "./support/totp";

// The MFA test enrols a factor on the shared admin account; a retry would find it already
// enrolled, so this file never retries. Each CI run starts from a fresh database.
test.describe.configure({ retries: 0 });

// Accounts come from `npm run seed:users`; each test signs in with its own browser context.

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test("a customer cannot open the admin", async ({ page }) => {
  await signInAs(page, "customer");
  await page.goto("/admin");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByTestId("admin-role")).toHaveCount(0);
});

test("email links only redirect to same-site paths", async ({ request }) => {
  // A real, verifiable token, so the request gets past validation to the redirect itself.
  for (const next of ["//evil.example", "/.//evil.example", "/%2e//evil.example", "https://evil.example"]) {
    const tokenHash = await magicLinkTokenHash("customer@example.test");
    const response = await request.get(
      `/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=${encodeURIComponent(next)}`,
      { maxRedirects: 0 },
    );
    expect(response.status(), next).toBe(307);
    const location = new URL(response.headers()["location"]!, "http://localhost:3000");
    expect(location.host, next).toBe("localhost:3000");
    expect(location.pathname, next).toBe("/");
  }

  const tokenHash = await magicLinkTokenHash("customer@example.test");
  const response = await request.get(
    `/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=${encodeURIComponent("/en")}`,
    { maxRedirects: 0 },
  );
  expect(new URL(response.headers()["location"]!, "http://localhost:3000").pathname).toBe("/en");
});

for (const [role, label] of [
  ["sales", "Kinh doanh"],
  ["sales_manager", "Quản lý kinh doanh"],
  ["operator", "Điều hành"],
  ["editor", "Biên tập"],
] as const) {
  test(`${role} signs in to the admin without MFA`, async ({ page }) => {
    await signInAs(page, role);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-role")).toHaveText(`Vai trò: ${label}`);
  });
}

test("the Sentry test route is closed to everyone but MFA-verified admins", async ({ page }) => {
  const signedOut = await page.request.post("/api/monitoring/test-error");
  expect(signedOut.status()).toBe(401);

  await signInAs(page, "editor");
  const editor = await page.request.post("/api/monitoring/test-error");
  expect(editor.status()).toBe(403);
  // A visited link (GET) never triggers it.
  expect((await page.request.get("/api/monitoring/test-error")).status()).toBe(405);
});

test("accountant is sent to MFA enrolment", async ({ page }) => {
  await signInAs(page, "accountant");
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await expect(page.getByRole("button", { name: "Bắt đầu thiết lập" })).toBeVisible();
});

test("admin enrols TOTP, reaches aal2, and must verify again after signing in", async ({
  page,
}) => {
  // Two sign-ins plus up to 30 s waiting for a fresh TOTP window.
  test.setTimeout(90_000);
  await signInAs(page, "admin");
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  // Below aal2 even an admin cannot trigger the Sentry test error.
  expect((await page.request.post("/api/monitoring/test-error")).status()).toBe(403);

  // Enrol: read the manual key and answer with a computed TOTP code.
  await page.getByRole("button", { name: "Bắt đầu thiết lập" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  await page.getByLabel("Mã xác thực").fill(totp(secret));
  await page.getByRole("button", { name: "Xác minh" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã bật xác thực hai lớp.");
  await page.getByRole("button", { name: "Vào trang quản trị" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("admin-role")).toHaveText("Vai trò: Quản trị viên");
  await expect(page.getByTestId("admin-aal")).toHaveText("Xác thực hai lớp: đã xác minh");
  // At aal2 the route throws on purpose (reported by onRequestError when a DSN is set).
  expect((await page.request.post("/api/monitoring/test-error")).status()).toBe(500);

  // A new session starts at aal1: the admin must verify the existing factor.
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await signInAs(page, "admin");
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await expect(page.getByText("Nhập mã 6 chữ số từ ứng dụng xác thực của bạn.")).toBeVisible();

  // The previous code may still be inside its 30-second window; wait for a fresh one to avoid
  // a replay rejection.
  const window = Math.floor(Date.now() / 30_000);
  await expect.poll(() => Math.floor(Date.now() / 30_000), { timeout: 35_000 }).toBeGreaterThan(window);
  await page.getByLabel("Mã xác thực").fill(totp(secret));
  await page.getByRole("button", { name: "Xác minh" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã bật xác thực hai lớp.");
  await page.getByRole("button", { name: "Vào trang quản trị" }).click();
  await expect(page.getByTestId("admin-aal")).toHaveText("Xác thực hai lớp: đã xác minh");

  // The admin menu offers the audit log; it lists the seed changes, filters by entity and keeps
  // the filter in the URL.
  const menu = page.getByRole("navigation", { name: "Điều hướng quản trị" });
  await menu.getByRole("link", { name: "Nhật ký thay đổi" }).click();
  await expect(page).toHaveURL(/\/admin\/audit-log$/);
  await expect(page.getByRole("heading", { level: 1, name: "Nhật ký thay đổi" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Nhật ký thay đổi" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("table", { name: "Nhật ký thay đổi" }).getByRole("row").nth(1)).toBeVisible();
  await expectNoSeriousViolations(page, "/admin/audit-log");
  await page.getByLabel("Đối tượng", { exact: true }).selectOption("settings");
  await page.getByRole("button", { name: "Lọc" }).click();
  await expect(page).toHaveURL(/entity=settings/);
  const rows = page.getByRole("table", { name: "Nhật ký thay đổi" }).getByRole("row");
  await expect(rows.nth(1)).toContainText("settings");
  await expect(rows.filter({ hasText: "tours" })).toHaveCount(0);

  // Cancellation policies need this aal2 admin session (spec Phase 2 step 10): the rules are
  // checked before saving, and a saved policy starts at version 1.
  await menu.getByRole("link", { name: "Chính sách huỷ" }).click();
  await expect(page.getByTestId("policy-card").first()).toBeVisible();
  await expectNoSeriousViolations(page, "/admin/cancellation-policies");
  await page.getByRole("link", { name: "Thêm chính sách" }).click();
  const policyName = `E2E ${Date.now().toString(36)}`;
  await page.getByLabel("Tên chính sách").fill(policyName);
  await page.getByRole("button", { name: "Thêm quy tắc" }).click();
  const rule = (index: number) => page.getByRole("group", { name: `Quy tắc ${index}` });
  await rule(1).getByLabel("Từ số ngày trước khởi hành").fill("30");
  await rule(1).getByLabel("Hoàn (%)").fill("80");
  await rule(2).getByLabel("Từ số ngày trước khởi hành").fill("7");
  await page.getByLabel("Tóm tắt hiển thị (tiếng Việt)").fill("Hoàn 80% nếu huỷ trước 30 ngày.");
  await page.getByLabel("Tóm tắt hiển thị (tiếng Anh)").fill("80% refund up to 30 days before departure.");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(rule(2)).toContainText("Quy tắc cuối phải là 0 ngày.");
  await rule(2).getByLabel("Từ số ngày trước khởi hành").fill("0");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page).toHaveURL(/\/admin\/cancellation-policies\/[0-9a-f-]{36}$/);
  // Exact: the list page navigated away from may still be in the DOM, hidden.
  await expect(page.getByText("Phiên bản 1", { exact: true })).toBeVisible();
  await expectNoSeriousViolations(page, "cancellation policy editor");
});

test("only admins see and open the audit log", async ({ page }) => {
  await signInAs(page, "editor");
  await expect(page).toHaveURL(/\/admin$/);
  const menu = page.getByRole("navigation", { name: "Điều hướng quản trị" });
  await expect(menu.getByRole("link", { name: "Tổng quan" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Nhật ký thay đổi" })).toHaveCount(0);
  await expectNoSeriousViolations(page, "/admin as editor");
  await page.goto("/admin/audit-log");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("the admin menu opens in a sheet on small screens", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInAs(page, "operator");
  await page.getByRole("button", { name: "Mở menu quản trị" }).click();
  const sheet = page.getByRole("dialog", { name: "Điều hướng quản trị" });
  await expect(sheet.getByRole("link", { name: "Tổng quan" })).toHaveAttribute("aria-current", "page");
  await expectNoSeriousViolations(page, "admin menu sheet", "[role=dialog]");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Mở menu quản trị" })).toBeFocused();
});
