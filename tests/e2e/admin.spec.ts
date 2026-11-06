import { expect, test } from "@playwright/test";

import { signInAs } from "./support/auth";
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
  await expect(page.getByTestId("admin-role")).toHaveCount(0);
  await expect(page.getByText("404")).toBeVisible();
});

for (const [role, label] of [
  ["sales", "Kinh doanh"],
  ["operator", "Điều hành"],
  ["editor", "Biên tập"],
] as const) {
  test(`${role} signs in to the admin without MFA`, async ({ page }) => {
    await signInAs(page, role);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-role")).toHaveText(`Vai trò: ${label}`);
  });
}

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
  await signInAs(page, "admin");
  await expect(page).toHaveURL(/\/admin\/mfa$/);

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
});
