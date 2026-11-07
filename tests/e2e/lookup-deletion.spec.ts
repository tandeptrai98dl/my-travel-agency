import { createHash, randomBytes } from "node:crypto";

import { expect, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { expectNoSeriousViolations } from "./support/axe";
import { booking, closeTestDepartures, heldBooking, testDeparture } from "./support/booking";

// Phase 5 PR 5B (docs/specs/phase-5-accounts-inquiries-operations.md decisions 7 and 8): the guest
// booking lookup answers the same whatever matched and emails (here: records) a single-use link;
// a customer deletes their account; one with a payment in progress has to wait.

test.describe.configure({ mode: "serial", retries: 0 });
test.afterAll(closeTestDepartures);

const stamp = `${Date.now()}`;
const sent = "Nếu thông tin khớp với một đặt chỗ, chúng tôi vừa gửi đường dẫn tới email đó. Đường dẫn dùng được một lần trong thời gian ngắn.";

async function lookup(page: import("@playwright/test").Page, code: string, email: string) {
  await page.goto("/tra-cuu-booking");
  const form = page.getByTestId("lookup-form");
  await form.getByLabel("Mã đặt chỗ").fill(code);
  await form.getByLabel("Email đặt chỗ").fill(email);
  await form.getByRole("button", { name: "Gửi đường dẫn" }).click();
  await expect(form.getByRole("status")).toHaveText(sent);
}

test("the lookup answers the same for right and wrong details and sends one link only for the right ones", async ({ page }) => {
  test.setTimeout(90_000);
  const held = await heldBooking(await testDeparture(2), "bank_transfer");
  const { code, contact_email: email } = (await adminApi().from("bookings").select("code, contact_email").eq("id", held.bookingId).single()).data!;
  const lookupRows = async () =>
    (await adminApi().from("email_logs").select("template, status, dedupe_key").eq("booking_id", held.bookingId).eq("template", "booking_lookup")).data ?? [];

  await page.goto("/tra-cuu-booking");
  await expect(page.getByRole("heading", { level: 1, name: "Tra cứu đặt chỗ" })).toBeVisible();
  await expectNoSeriousViolations(page, "/tra-cuu-booking");
  await page.getByTestId("lookup-form").getByRole("button", { name: "Gửi đường dẫn" }).click();
  await expect(page.getByText("Mã đặt chỗ có dạng PTA-2611-0042.")).toBeVisible();

  await lookup(page, code, `someone-else-${stamp}@example.test`);
  await lookup(page, "PTA-2699-9999", email);
  await lookup(page, code.toLowerCase(), email.toUpperCase());
  // The email goes out after the answer (Resend is off in CI: a `skipped` row, keyed on the token).
  await expect.poll(async () => (await lookupRows()).length, { timeout: 15_000 }).toBe(1);
  const [row] = await lookupRows();
  expect(row).toMatchObject({ status: "skipped" });
  expect(row!.dedupe_key).toMatch(/^booking_lookup:[0-9a-f-]{36}$/);
  const { data: tokens } = await adminApi().from("booking_access_tokens").select("purpose, used_at").eq("booking_id", held.bookingId).eq("purpose", "lookup");
  expect(tokens).toEqual([{ purpose: "lookup", used_at: null }]);

  await page.goto("/en/booking-lookup");
  await expect(page.getByRole("heading", { level: 1, name: "Find your booking" })).toBeVisible();
});

test("a lookup link opens the booking once, after a click", async ({ browser }) => {
  // CI sends no email, so the test issues a lookup token the way the email would carry it.
  const held = await heldBooking(await testDeparture(2), "bank_transfer");
  const { code } = await booking(held.bookingId);
  const token = randomBytes(32).toString("base64url");
  const { error } = await adminApi().rpc("issue_booking_access_token", {
    target_id: held.bookingId,
    purpose: "lookup",
    token_hash: createHash("sha256").update(token).digest("hex"),
    valid_minutes: 30,
  });
  expect(error).toBeNull();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/thanh-toan/${code}?access=${token}`);
  await expect(page.getByTestId("checkout-email-link")).toHaveAttribute("data-state", "valid");
  await page.getByRole("button", { name: "Mở đặt chỗ" }).click();
  await expect(page).toHaveURL(new RegExp(`/thanh-toan/${code}$`));
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await stranger.goto(`/thanh-toan/${code}?access=${token}`);
  await expect(stranger.getByTestId("checkout-email-link")).toHaveAttribute("data-state", "used");
  await context.close();
  await other.close();
});

async function customer(label: string) {
  const email = `${label}-${stamp}@example.test`;
  const password = `e2e-${label}-${stamp}-Aa1!`;
  const created = await adminApi().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Khách Xoá Dữ Liệu" } });
  if (created.error) throw created.error;
  return { id: created.data.user.id, email, password };
}

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/dang-nhap");
  const form = page.getByTestId("login-form");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Đăng nhập" }).click();
}

test("a customer deletes their account: anonymised, unlinked, signed out for good", async ({ page }) => {
  test.setTimeout(90_000);
  const person = await customer("delete");
  const { error } = await adminApi().from("subscribers").insert({ email: person.email, locale: "vi", confirmed_at: new Date().toISOString() });
  expect(error).toBeNull();
  await signIn(page, person.email, person.password);
  await expect(page).toHaveURL(/\/tai-khoan$/);
  await page.goto("/tai-khoan/ho-so");
  const form = page.getByTestId("deletion-form");
  await expect(form).toBeVisible();
  await expectNoSeriousViolations(page, "/tai-khoan/ho-so (deletion)");
  await form.getByLabel("Mật khẩu hiện tại").fill("not-my-password");
  await form.getByRole("button", { name: "Xoá tài khoản" }).click();
  await expect(form.getByText("Mật khẩu hiện tại chưa đúng.")).toBeVisible();
  await form.getByLabel("Mật khẩu hiện tại").fill(person.password);
  await form.getByRole("button", { name: "Xoá tài khoản" }).click();
  await expect(page).toHaveURL(/\/dang-nhap\?deleted=1$/);
  await expect(page.getByTestId("account-deleted")).toContainText("Tài khoản của bạn đã được xoá");

  const { data: profile } = await adminApi().from("profiles").select("full_name, email, deleted_at").eq("id", person.id).single();
  expect(profile).toMatchObject({ full_name: null, email: `deleted+${person.id}@invalid.local` });
  expect(profile!.deleted_at).not.toBeNull();
  expect((await adminApi().from("subscribers").select("id").eq("email", person.email)).data).toEqual([]);
  const { data: auth } = await adminApi().auth.admin.getUserById(person.id);
  expect(auth.user?.email ?? "").not.toBe(person.email);
  // The ban cleared the user metadata, so the name is gone from Auth too.
  const { data: meta } = await adminApi().schema("auth" as never).from("users").select("raw_user_meta_data").eq("id", person.id).maybeSingle();
  expect(JSON.stringify(meta ?? auth.user?.user_metadata ?? {})).not.toContain("Khách Xoá Dữ Liệu");

  // The account is gone: the old password signs nobody in, and the account pages send to sign-in.
  await page.goto("/tai-khoan");
  await expect(page).toHaveURL(/\/dang-nhap/);
  await signIn(page, person.email, person.password);
  await expect(page.getByTestId("login-form").getByRole("status")).toHaveText("Email hoặc mật khẩu chưa đúng.");
});

test("a customer with a payment in progress is told the deletion waits", async ({ page }) => {
  test.setTimeout(90_000);
  const person = await customer("wait");
  const held = await heldBooking(await testDeparture(2), "bank_transfer");
  expect((await adminApi().from("bookings").update({ customer_id: person.id }).eq("id", held.bookingId)).error).toBeNull();
  await signIn(page, person.email, person.password);
  await expect(page).toHaveURL(/\/tai-khoan$/);
  await page.goto("/tai-khoan/ho-so");
  const form = page.getByTestId("deletion-form");
  await form.getByLabel("Mật khẩu hiện tại").fill(person.password);
  await form.getByRole("button", { name: "Xoá tài khoản" }).click();
  await expect(form.getByRole("status")).toContainText("Chúng tôi đã ghi nhận yêu cầu");
  const { data: profile } = await adminApi().from("profiles").select("deleted_at, deletion_requested_at").eq("id", person.id).single();
  expect(profile!.deleted_at).toBeNull();
  expect(profile!.deletion_requested_at).not.toBeNull();
  // Still signed in: nothing was taken away yet.
  await page.goto("/tai-khoan");
  await expect(page).toHaveURL(/\/tai-khoan$/);
});
