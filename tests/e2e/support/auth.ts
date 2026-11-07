import { expect, type Page } from "@playwright/test";

/** Password of the accounts created by `npm run seed:users` (set in CI). */
export function seedPassword(): string {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password) throw new Error("SEED_USER_PASSWORD must be set for the sign-in tests");
  return password;
}

/** Signs in through the staff /auth/login page (Vietnamese since Phase 5 PR 5A) as `<role>@example.test`. */
export async function signInAs(page: Page, role: string): Promise<void> {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(`${role.replace("_", "-")}@example.test`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(seedPassword());
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}
