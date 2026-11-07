import { expect, type Page } from "@playwright/test";

import { adminApi } from "./admin-api";
import { totp } from "./totp";

/**
 * Starts TOTP enrolment on /admin/mfa and returns the manual key. The start button is a client
 * handler, so a click that lands before hydration does nothing (the cause of intermittent
 * "waiting for mfa-secret" timeouts under load): click again until the key appears.
 */
export async function startTotpEnrolment(page: Page): Promise<string> {
  const secret = page.getByTestId("mfa-secret");
  await expect(async () => {
    if (!(await secret.isVisible())) await page.getByRole("button", { name: "Bắt đầu thiết lập" }).click({ timeout: 3_000 });
    await expect(secret).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  return (await secret.textContent())?.trim() ?? "";
}

/**
 * A fresh staff account (never the shared seeded one, so no other spec's MFA enrolment races
 * with it). Admin and accountant enrol TOTP on first sign-in and land on /admin at aal2.
 */
export async function freshStaff(page: Page, role: "admin" | "accountant", label: string): Promise<string> {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `${role}-${label}-${stamp}@example.test`;
  const password = `e2e-${label}-${stamp}-Aa1!`;
  const created = await adminApi().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const { error } = await adminApi().from("profiles").update({ role }).eq("id", created.data.user.id);
  if (error) throw error;
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  const secret = await startTotpEnrolment(page);
  await page.getByLabel("Mã xác thực").fill(totp(secret));
  await page.getByRole("button", { name: "Xác minh" }).click();
  await page.getByRole("button", { name: "Vào trang quản trị" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return created.data.user.id;
}

/** A fresh customer account, signed in on the localized customer sign-in page. */
export async function freshCustomer(page: Page, label: string): Promise<string> {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `cust-${label}-${stamp}@example.test`;
  const password = `e2e-${label}-${stamp}-Aa1!`;
  const created = await adminApi().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  await page.goto("/dang-nhap");
  const form = page.getByTestId("login-form");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/tai-khoan$/);
  return created.data.user.id;
}
