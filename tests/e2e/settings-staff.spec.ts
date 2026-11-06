import { expect, type Page, test } from "@playwright/test";

import { adminApi } from "./support/admin-api";
import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";
import { totp } from "./support/totp";

// Settings, staff and the dashboard (docs/specs/phase-2-catalog-admin.md steps 21–23, ADR-032).
// The aal2 flows use their own admin account (created here), so they never touch the shared
// admin that admin.spec.ts enrols. The invitation email is read from the local Mailpit.

const stamp = `${Date.now()}`;
const password = `e2e-staff-${stamp}-Aa1!`;

async function signIn(page: Page, email: string, secret: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(secret);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

/** The invitation link from Mailpit, as a path on the app under test. */
async function invitationPath(email: string): Promise<string> {
  const mail = process.env.E2E_MAIL_URL;
  if (!mail) throw new Error("E2E_MAIL_URL must be set (Mailpit)");
  let html = "";
  await expect
    .poll(
      async () => {
        const search = await fetch(`${mail}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
        const found = (await search.json()) as { messages?: { ID: string }[] };
        const id = found.messages?.[0]?.ID;
        if (!id) return false;
        html = ((await (await fetch(`${mail}/api/v1/message/${id}`)).json()) as { HTML: string }).HTML;
        return true;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const href = /href="([^"]*\/auth\/confirm\?[^"]+)"/.exec(html)?.[1];
  if (!href) throw new Error("no invitation link in the email");
  const url = new URL(href.replaceAll("&amp;", "&"));
  return `${url.pathname}${url.search}`;
}

test.describe.configure({ retries: 0 });

test("other staff roles cannot open settings or staff", async ({ page }) => {
  await signInAs(page, "editor");
  for (const path of ["/admin/settings", "/admin/staff"]) {
    await page.goto(path);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  }
  // The dashboard links only to what an editor can use.
  await page.goto("/admin");
  const shortcuts = page.getByRole("region", { name: "Lối tắt" });
  await expect(shortcuts.getByRole("link", { name: /^Tạp chí/ })).toBeVisible();
  await expect(shortcuts.getByRole("link", { name: /^Cài đặt/ })).toHaveCount(0);
  await expect(page.getByTestId("admin-role")).toHaveText("Vai trò: Biên tập");
});

test("an aal2 admin edits settings, invites staff and changes their role and access", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const adminEmail = `staff-admin-${stamp}@example.test`;
  const inviteeEmail = `invitee-${stamp}@example.test`;
  const created = await adminApi().auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  if (created.error) throw created.error;
  const { error } = await adminApi()
    .from("profiles")
    .update({ role: "admin", full_name: "Quản trị E2E" })
    .eq("id", created.data.user.id);
  if (error) throw error;

  // Enrol TOTP to reach aal2.
  await signIn(page, adminEmail, password);
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await page.getByRole("button", { name: "Bắt đầu thiết lập" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())?.trim() ?? "";
  await page.getByLabel("Mã xác thực").fill(totp(secret));
  await page.getByRole("button", { name: "Xác minh" }).click();
  await page.getByRole("button", { name: "Vào trang quản trị" }).click();
  await expect(page.getByTestId("admin-aal")).toHaveText("Xác thực hai lớp: đã xác minh");
  await expectNoSeriousViolations(page, "/admin (admin)");

  // Settings: client-side checks, then a saved booking rule (restored afterwards).
  const menu = page.getByRole("navigation", { name: "Điều hướng quản trị" });
  await menu.getByRole("link", { name: "Cài đặt" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cài đặt" })).toBeVisible();
  await expectNoSeriousViolations(page, "/admin/settings");
  const social = page.getByTestId("settings-social");
  await social.getByLabel("Facebook").fill("http://facebook.com/brand");
  await social.getByRole("button", { name: "Lưu phần này" }).click();
  await expect(social.getByText("Đường dẫn phải bắt đầu bằng https://.")).toBeVisible();
  const rules = page.getByTestId("settings-booking_rules");
  const cutoff = rules.getByLabel("Hạn chót đặt tour (số ngày trước khởi hành)");
  await cutoff.fill("61");
  await rules.getByRole("button", { name: "Lưu phần này" }).click();
  await expect(rules.getByText("Giá trị nằm ngoài khoảng cho phép.")).toBeVisible();
  await cutoff.fill("10");
  await rules.getByRole("button", { name: "Lưu phần này" }).click();
  await expect(page.getByRole("region", { name: /^Thông báo/ }).getByText("Đã lưu")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("settings-booking_rules").getByLabel("Hạn chót đặt tour (số ngày trước khởi hành)")).toHaveValue("10");
  await page.getByTestId("settings-booking_rules").getByLabel("Hạn chót đặt tour (số ngày trước khởi hành)").fill("7");
  await page.getByTestId("settings-booking_rules").getByRole("button", { name: "Lưu phần này" }).click();
  await expect(page.getByRole("region", { name: /^Thông báo/ }).getByText("Đã lưu").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Mở chính sách huỷ" })).toHaveAttribute("href", "/admin/cancellation-policies");

  // Staff: the admin's own row cannot be changed.
  await menu.getByRole("link", { name: "Nhân viên" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nhân viên" })).toBeVisible();
  const own = page.getByTestId("staff-row").filter({ hasText: adminEmail });
  await expect(own.getByRole("button", { name: "Khoá tài khoản" })).toBeDisabled();
  await expect(own.getByText("Bạn không thể tự đổi vai trò hoặc khoá tài khoản của mình.")).toBeVisible();
  await expectNoSeriousViolations(page, "/admin/staff");

  // Invite an editor.
  await page.getByLabel("Email", { exact: true }).fill(inviteeEmail);
  await page.getByLabel("Họ và tên").fill("Nhân viên thử");
  await page.getByLabel("Vai trò", { exact: true }).selectOption("editor");
  await page.getByRole("button", { name: "Gửi lời mời" }).click();
  await expect(page.getByRole("region", { name: /^Thông báo/ }).getByText(`Đã gửi lời mời tới ${inviteeEmail}`)).toBeVisible();
  const row = page.getByTestId("staff-row").filter({ hasText: inviteeEmail });
  await expect(row.getByText("Đã mời")).toBeVisible();

  // The invitee accepts from the email and lands in the admin with the chosen role.
  const path = await invitationPath(inviteeEmail);
  const invitee = await browser.newContext();
  const inviteePage = await invitee.newPage();
  await inviteePage.goto(path);
  await expect(inviteePage).toHaveURL(/\/auth\/update-password$/);
  await inviteePage.getByLabel("New password").fill(`${password}-invitee`);
  await inviteePage.getByRole("button", { name: "Save new password" }).click();
  await expect(inviteePage).toHaveURL(/\/admin$/);
  await expect(inviteePage.getByTestId("admin-role")).toHaveText("Vai trò: Biên tập");

  // Role change and deactivation.
  await page.reload();
  await expect(row.getByText("Đang hoạt động")).toBeVisible();
  // Inviting an address that already has an account is refused on the email field.
  await page.getByLabel("Email", { exact: true }).fill(inviteeEmail);
  await page.getByLabel("Họ và tên").fill("Nhân viên thử");
  await page.getByRole("button", { name: "Gửi lời mời" }).click();
  await expect(page.getByText("Email này đã có tài khoản.", { exact: false })).toBeVisible();
  await row.getByLabel("Vai trò của Nhân viên thử").selectOption("operator");
  await row.getByRole("button", { name: "Đổi vai trò" }).click();
  await expect(page.getByRole("region", { name: /^Thông báo/ }).getByText("Đã đổi vai trò của Nhân viên thử")).toBeVisible();
  await row.getByRole("button", { name: "Khoá tài khoản" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Khoá tài khoản" }).click();
  await expect(row.getByText("Đã khoá")).toBeVisible();
  await inviteePage.goto("/admin");
  await expect(inviteePage.getByText("This page could not be found.")).toBeVisible();
  await invitee.close();

  // The audit log, filtered by this admin, shows the invitation with the admin as actor.
  await own.getByRole("link", { name: /^Xem nhật ký thay đổi/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/audit-log\\?actor=${created.data.user.id}$`));
  const table = page.getByRole("table", { name: "Nhật ký thay đổi" });
  await expect(table.getByText("staff.invite")).toBeVisible();
  await expect(page.getByLabel("Người thực hiện")).toHaveValue(created.data.user.id);
});
