import { expect, test } from "@playwright/test";

import { magicLinkTokenHash } from "./support/admin-api";
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
