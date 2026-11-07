import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import { expect, type Page, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";
import { closeTestDepartures, heldBooking, testDeparture } from "./support/booking";
import { totp } from "./support/totp";

// Phase 5 PR 5D (docs/specs/phase-5-accounts-inquiries-operations.md decisions 8, 13, 14 and 16):
// the dashboard per role, the passenger list export, the customers admin per role, an admin who
// finishes a blocked deletion once the blocker clears (the Auth user loses its name for real),
// and signing up again with the same address re-attaches the unlinked bookings.

test.describe.configure({ mode: "serial", retries: 0 });
test.afterAll(closeTestDepartures);

const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const password = `e2e-ops-${stamp}-Aa1!`;
const customerEmail = `ops-cust-${stamp}@example.test`;
const customerName = "Khách Vận Hành";
let customerId = "";
let bookingId = "";
let bookingCode = "";

/** Runs one SQL statement through psql (the REST API cannot read `auth.users`). */
function psql(sql: string): string {
  const result = spawnSync("psql", [process.env.E2E_DB_URL!, "-qXtA", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`);
  return result.stdout.trim();
}

/** A fresh staff account that enrols TOTP on first sign-in (admin and accountant need aal2). */
async function mfaStaff(page: Page, role: "admin" | "accountant") {
  const email = `${role}-ops-${stamp}@example.test`;
  const created = await adminApi().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const { error } = await adminApi().from("profiles").update({ role, full_name: `${role} vận hành` }).eq("id", created.data.user.id);
  if (error) throw error;
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await page.getByRole("button", { name: "Bắt đầu thiết lập" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())?.trim() ?? "";
  await page.getByLabel("Mã xác thực").fill(totp(secret));
  await page.getByRole("button", { name: "Xác minh" }).click();
  await page.getByRole("button", { name: "Vào trang quản trị" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function sections(page: Page) {
  await expect(page.getByTestId("dashboard-figures")).toBeVisible();
  const ids = await page.getByTestId("dashboard-figures").locator("[data-testid^='dashboard-']").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")));
  return ids.sort();
}

test("setup: a customer with a payment in progress asks for deletion", async () => {
  const created = await adminApi().auth.admin.createUser({
    email: customerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: customerName, locale: "vi" },
  });
  if (created.error) throw created.error;
  customerId = created.data.user.id;
  const held = await heldBooking(await testDeparture(3), "bank_transfer");
  bookingId = held.bookingId;
  const { data, error } = await adminApi()
    .from("bookings")
    .update({ customer_id: customerId, contact_email: customerEmail, contact_name: customerName })
    .eq("id", bookingId)
    .select("code")
    .single();
  if (error) throw error;
  bookingCode = data.code;
  const { error: noteError } = await adminApi().from("internal_notes").insert({
    body: "Khách thích phòng tầng cao",
    author_id: (await adminApi().from("profiles").select("id").eq("email", "sales@example.test").single()).data!.id,
    customer_id: customerId,
  });
  expect(noteError).toBeNull();
  const { data: reasons, error: requestError } = await adminApi().rpc("request_customer_deletion", { target_id: customerId });
  expect(requestError).toBeNull();
  expect(reasons).toEqual(["open_payment"]);
});

test("sales: their dashboard, the customer list and detail with notes, nothing for admins only", async ({ page }) => {
  await signInAs(page, "sales");
  expect(await sections(page)).toEqual(["dashboard-sales"]);
  await expect(page.getByTestId("dashboard-sales")).toContainText("Của bạn");
  await expectNoSeriousViolations(page, "/admin dashboard (sales)");

  await page.getByRole("navigation", { name: "Điều hướng quản trị" }).getByRole("link", { name: "Khách hàng" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Khách hàng" })).toBeVisible();
  await expect(page.locator("#deletion-requests")).toHaveCount(0);
  await page.getByLabel("Tìm theo tên hoặc email").fill(customerEmail);
  await page.getByRole("button", { name: "Lọc" }).click();
  await page.getByRole("link", { name: customerName }).click();
  await expect(page.getByRole("heading", { level: 1, name: customerName })).toBeVisible();
  await expectNoSeriousViolations(page, "/admin/customers/[id] (sales)");
  await expect(page.getByTestId("customer-bookings")).toContainText(bookingCode);
  await expect(page.getByTestId("customer-notes")).toContainText("Khách thích phòng tầng cao");
  await expect(page.getByTestId("customer-deletion")).toContainText("Quản trị viên");
  await expect(page.getByRole("button", { name: "Tải dữ liệu cá nhân (JSON)" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Xoá dữ liệu" })).toHaveCount(0);

  const note = page.getByRole("form", { name: "Thêm ghi chú" });
  await note.getByRole("button", { name: "Lưu ghi chú" }).click();
  await expect(note.getByText("Hãy ghi chú ít nhất 3 ký tự.")).toBeVisible();
  await note.getByLabel("Ghi chú").fill("Gọi lại sau 17 giờ");
  await note.getByRole("button", { name: "Lưu ghi chú" }).click();
  await expect(page.getByTestId("customer-notes")).toContainText("Gọi lại sau 17 giờ");
});

test("a sales manager sees the team's numbers", async ({ page }) => {
  await signInAs(page, "sales_manager");
  expect(await sections(page)).toEqual(["dashboard-sales"]);
  await expect(page.getByTestId("dashboard-sales")).toContainText("Cả nhóm");
});

test("operator: operations dashboard, notes read-only, the passenger list export (audit-logged)", async ({ page }) => {
  await signInAs(page, "operator");
  expect(await sections(page)).toEqual(["dashboard-operations"]);
  await expect(page.getByTestId("dashboard-operations")).toContainText("14 ngày tới");

  await page.goto(`/admin/customers/${customerId}`);
  await expect(page.getByTestId("customer-notes")).toContainText("Khách thích phòng tầng cao");
  await expect(page.getByRole("form", { name: "Thêm ghi chú" })).toHaveCount(0);

  // A confirmed booking with one traveller on a departure of its own.
  const departure = await testDeparture(4);
  const held = await heldBooking(departure, "bank_transfer");
  await adminApi().from("bookings").update({ status: "confirmed", payment_state: "paid", amount_paid: departure.price, contact_phone: "+84 912 345 678" }).eq("id", held.bookingId);
  await adminApi().from("travellers").insert({ booking_id: held.bookingId, full_name: "=SUM(1+1)", nationality: "VN", is_lead: true });

  await page.goto(`/admin/departures/${departure.departureId}`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Tải danh sách khách (CSV)" }).click()]);
  const csv = await readFile((await download.path())!, "utf8");
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  expect(lines[0]).toBe('"full_name","date_of_birth","nationality","dietary_notes","booking_code","lead","lead_phone","party_size"');
  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain(`"'=SUM(1+1)"`);
  expect(lines[1]).toContain(`"'+84 912 345 678"`);
  expect(csv.toLowerCase()).not.toContain("passport");
  const { data: audit } = await adminApi()
    .from("audit_logs")
    .select("action, changes, actor_id")
    .eq("entity_id", departure.departureId)
    .eq("action", "departures.passenger_export");
  expect(audit).toHaveLength(1);
  expect(audit![0]!.changes).toEqual({ count: 1 });
});

test("editor: the content dashboard and no customers area", async ({ page }) => {
  await signInAs(page, "editor");
  expect(await sections(page)).toEqual(["dashboard-content"]);
  await expect(page.getByRole("navigation", { name: "Điều hướng quản trị" }).getByRole("link", { name: "Khách hàng" })).toHaveCount(0);
  await page.goto("/admin/customers");
  await expect(page.getByRole("heading", { level: 1, name: "Khách hàng" })).toHaveCount(0);
});

test("accountant: the finance dashboard and read-only customers", async ({ page }) => {
  test.setTimeout(60_000);
  await mfaStaff(page, "accountant");
  expect(await sections(page)).toEqual(["dashboard-finance"]);
  await page.goto(`/admin/customers/${customerId}`);
  await expect(page.getByTestId("customer-bookings")).toContainText(bookingCode);
  await expect(page.getByTestId("customer-notes")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tải dữ liệu cá nhân (JSON)" })).toHaveCount(0);
});

test("admin: every section, a blocked request finished once the blocker clears, the data export", async ({ page }) => {
  test.skip(!process.env.E2E_DB_URL, "needs the local database URL (CI)");
  test.setTimeout(120_000);
  await mfaStaff(page, "admin");
  expect(await sections(page)).toEqual(["dashboard-admin", "dashboard-content", "dashboard-finance", "dashboard-operations", "dashboard-sales"]);
  await expectNoSeriousViolations(page, "/admin dashboard (admin)");

  await page.getByTestId("stat-deletion-requests").click();
  await expect(page.getByTestId("deletion-requests")).toContainText(customerName);
  await expect(page.getByTestId("deletion-requests")).toContainText("thanh toán đang chờ");
  await page.getByTestId("deletion-requests").getByRole("link", { name: customerName }).click();
  await expect(page.getByTestId("deletion-state")).toHaveText("Đang chờ: thanh toán đang chờ");
  await expect(page.getByRole("button", { name: "Xoá dữ liệu" })).toHaveCount(0);
  await expectNoSeriousViolations(page, "/admin/customers/[id] (admin, blocked)");

  // The export: JSON of the profile, bookings, travellers, consents and inquiries, audit-logged.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Tải dữ liệu cá nhân (JSON)" }).click()]);
  const exported = JSON.parse(await readFile((await download.path())!, "utf8")) as Record<string, unknown> & { profile: { confirmed_email: string }; bookings: { code: string }[] };
  expect(Object.keys(exported)).toEqual(expect.arrayContaining(["profile", "bookings", "travellers", "consents", "inquiries"]));
  expect(exported.profile.confirmed_email).toBe(customerEmail);
  expect(exported.bookings.map((b) => b.code)).toContain(bookingCode);
  expect(JSON.stringify(exported)).not.toMatch(/needs_attention|idempotency_key|raw_response/);
  const { data: exportAudit } = await adminApi().from("audit_logs").select("action").eq("entity_id", customerId).eq("action", "customers.export");
  expect(exportAudit).toHaveLength(1);

  // Before the deletion the Auth metadata holds the name, so the check after it means something.
  expect(psql(`select raw_user_meta_data ->> 'full_name' from auth.users where id = '${customerId}'`)).toBe(customerName);

  // The payment lapses: nothing blocks the request any more.
  const { error } = await adminApi().rpc("cancel_booking", { target_id: bookingId, actor: null as unknown as string, reason: "e2e: hết hạn" });
  expect(error).toBeNull();
  await page.reload();
  await expect(page.getByTestId("deletion-state")).toHaveText("Không còn gì cản trở: có thể hoàn tất.");
  const finish = page.getByRole("form", { name: "Hoàn tất xoá dữ liệu" });
  await finish.getByRole("button", { name: "Xoá dữ liệu" }).click();
  await expect(finish.getByText("Hãy ghi chú ít nhất 3 ký tự.")).toBeVisible();
  await finish.getByLabel("Ghi chú (bắt buộc)").fill("Thanh toán đã huỷ, không còn chuyến đi");
  await finish.getByRole("button", { name: "Xoá dữ liệu" }).click();
  await expect(page.getByTestId("customer-deletion")).toContainText("Đã xoá xong.");

  const { data: profile } = await adminApi().from("profiles").select("full_name, email, deleted_at").eq("id", customerId).single();
  expect(profile).toMatchObject({ full_name: null, email: `deleted+${customerId}@invalid.local` });
  expect(profile!.deleted_at).not.toBeNull();
  const { data: unlinked } = await adminApi().from("bookings").select("customer_id").eq("id", bookingId).single();
  expect(unlinked?.customer_id).toBeNull();
  // The Auth row still exists (soft delete), is banned and deleted, and its metadata lost the name.
  const auth = JSON.parse(
    psql(
      `select json_build_object('meta', raw_user_meta_data, 'deleted', deleted_at is not null, 'banned', banned_until > now(), 'email', email) from auth.users where id = '${customerId}'`,
    ),
  ) as { meta: Record<string, unknown> | null; deleted: boolean; banned: boolean; email: string | null };
  expect(auth.deleted).toBe(true);
  expect(auth.banned).toBe(true);
  expect(auth.email).not.toBe(customerEmail);
  expect(auth.meta ?? {}).not.toHaveProperty("full_name");
  expect(JSON.stringify(auth.meta)).not.toContain(customerName);
  const { data: adminAudit } = await adminApi().from("audit_logs").select("changes").eq("entity_id", customerId).eq("action", "customers.anonymise_by_admin");
  expect(adminAudit).toHaveLength(1);

  await page.goto("/admin/customers");
  await expect(page.locator("#deletion-requests")).not.toContainText(customerName);
});

/** The newest Auth email to an address, as a path on the app under test (Mailpit). */
async function emailLinkPath(to: string): Promise<string> {
  const mail = process.env.E2E_MAIL_URL;
  if (!mail) throw new Error("E2E_MAIL_URL must be set (Mailpit)");
  let html = "";
  await expect
    .poll(
      async () => {
        const search = await fetch(`${mail}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
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
  if (!href) throw new Error("no confirmation link in the email");
  const url = new URL(href.replaceAll("&amp;", "&"));
  return `${url.pathname}${url.search}`;
}

test("signing up again with the same email re-attaches the bookings", async ({ page }) => {
  test.skip(!process.env.E2E_DB_URL || !process.env.E2E_MAIL_URL, "needs the local stack (CI)");
  test.setTimeout(90_000);
  await page.goto("/dang-ky");
  const form = page.getByTestId("register-form");
  await form.getByLabel("Họ và tên").fill("Khách Quay Lại");
  await form.getByLabel("Email").fill(customerEmail);
  await form.getByLabel("Mật khẩu").fill(`${password}-again`);
  await form.getByLabel(/Tôi đồng ý với/).check();
  await form.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByRole("status").filter({ hasText: "chúng tôi đã gửi liên kết xác nhận" })).toBeVisible();

  await page.goto(await emailLinkPath(customerEmail));
  await expect(page).toHaveURL(/\/tai-khoan$/);
  const { data: account } = await adminApi().from("profiles").select("id").eq("email", customerEmail).single();
  expect(account?.id).toBeTruthy();
  expect(account!.id).not.toBe(customerId);
  const { data: attached } = await adminApi().from("bookings").select("customer_id").eq("id", bookingId).single();
  expect(attached?.customer_id).toBe(account!.id);
  await page.goto("/tai-khoan/booking");
  await expect(page.getByText(bookingCode, { exact: true })).toBeVisible();
});
