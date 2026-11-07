import { expect, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";
import { startTotpEnrolment } from "./support/staff";
import { totp } from "./support/totp";

// Phase 5 PR 5C (docs/specs/phase-5-accounts-inquiries-operations.md decision 9): sales take an
// inquiry, note the first contact and quote it; a sales manager assigns an inquiry another person
// owns; operators read; accountants have no inbox.

test.describe.configure({ mode: "serial", retries: 0 });

const stamp = `${Date.now()}`;
const open = { id: "", code: `INQ-2699-${stamp.slice(-6)}` };
const owned = { id: "", code: `INQ-2698-${stamp.slice(-6)}` };

async function profileId(email: string): Promise<string> {
  const { data, error } = await adminApi().from("profiles").select("id").eq("email", email).single();
  if (error) throw error;
  return data.id;
}

async function inquiryRow(id: string) {
  const { data, error } = await adminApi().from("inquiries").select("status, assigned_to, first_responded_at").eq("id", id).single();
  if (error) throw error;
  return data;
}

test.beforeAll(async () => {
  const api = adminApi();
  const { data: tour } = await api.from("tours").select("id").eq("code", "VN-HER-05").single();
  const adminId = await profileId("admin@example.test");
  // One insert per row: a bulk insert sends the union of the keys, with null for the missing ones.
  const insert = async (row: Record<string, unknown>) => {
    const { data, error } = await api.from("inquiries").insert(row).select("id").single();
    if (error) throw error;
    return data.id as string;
  };
  open.id = await insert({
    code: open.code,
    name: "Anna Berg",
    email: `anna-${stamp}@example.test`,
    phone: "+46 70 000 00 00",
    locale: "en",
    source: "tour_inquiry",
    tour_id: tour?.id ?? null,
    adults: 3,
    children: 1,
    travel_month: "2027-03",
    message: "We would love a slow week in Hoi An.",
  });
  owned.id = await insert({ code: owned.code, name: "Minh Trần", email: `minh-${stamp}@example.test`, locale: "vi", source: "contact", assigned_to: adminId, message: "Xin tư vấn." });
});

test("sales take an inquiry, record the first contact and quote it", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, "sales");
  const menu = page.getByRole("navigation", { name: "Điều hướng quản trị" });
  await menu.getByRole("link", { name: "Yêu cầu tư vấn" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Yêu cầu tư vấn" })).toBeVisible();
  await page.getByLabel("Tìm theo mã, tên hoặc email").fill(open.code);
  await page.getByRole("button", { name: "Lọc" }).click();
  const row = page.getByRole("row").filter({ hasText: open.code });
  await expect(row).toContainText("Chưa giao");
  await expect(row).toContainText("Đang chờ");
  await expectNoSeriousViolations(page, "/admin/inquiries (sales)");
  // An inquiry someone else owns is not in a seller's list.
  await page.getByLabel("Tìm theo mã, tên hoặc email").fill(owned.code);
  await page.getByRole("button", { name: "Lọc" }).click();
  await expect(page.getByRole("row").filter({ hasText: owned.code })).toHaveCount(0);

  await page.goto(`/admin/inquiries/${open.id}`);
  await expect(page.getByRole("heading", { level: 1, name: open.code })).toBeVisible();
  await expect(page.getByText("We would love a slow week in Hoi An.")).toBeVisible();
  await expectNoSeriousViolations(page, "/admin/inquiries/[id] (sales)");

  await page.getByRole("button", { name: "Nhận yêu cầu này" }).click();
  await expect.poll(async () => (await inquiryRow(open.id)).assigned_to).toBe(await profileId("sales@example.test"));
  // The page refreshes after taking it (the "take" form goes); work on the refreshed forms.
  await expect(page.getByRole("button", { name: "Nhận yêu cầu này" })).toHaveCount(0);

  const note = page.getByRole("form", { name: "Thêm ghi chú" });
  await note.getByRole("button", { name: "Thêm ghi chú" }).click();
  await expect(note.getByText("Hãy ghi chú ít nhất 3 ký tự.")).toBeVisible();
  await note.getByLabel("Ghi chú", { exact: true }).fill("Called Anna, she prefers March.");
  await note.getByRole("checkbox", { name: "Tôi đã liên hệ khách" }).click();
  await note.getByRole("button", { name: "Thêm ghi chú" }).click();
  await expect(page.getByTestId("inquiry-notes")).toContainText("Called Anna, she prefers March.");
  await expect.poll(async () => (await inquiryRow(open.id)).status).toBe("contacted");
  expect((await inquiryRow(open.id)).first_responded_at).not.toBeNull();
  await expect(page.getByTestId("inquiry-history").locator('li[data-action="inquiries.note"]')).toContainText("đã liên hệ khách");

  // The quote form starts from the inquiry.
  await page.getByRole("link", { name: "Tạo báo giá từ yêu cầu này" }).click();
  await expect(page).toHaveURL(/\/admin\/bookings\/new\?inquiry=/);
  const form = page.getByRole("form", { name: "Tạo báo giá" });
  await expect(form.getByLabel("Mã yêu cầu tư vấn (không bắt buộc)")).toHaveValue(open.code);
  await expect(form.getByLabel("Họ tên khách")).toHaveValue("Anna Berg");
  await expect(form.getByLabel("Người lớn", { exact: true })).toHaveValue("3");
  await expect(form.getByLabel("Ngày khởi hành")).toHaveValue("2027-03-01");
  await form.getByLabel("Giá mỗi người lớn (VND)").fill("20.000.000");
  await form.getByLabel("Giá mỗi trẻ em (VND)").fill("10.000.000");
  await form.getByRole("button", { name: "Tạo báo giá" }).click();
  await expect(page).toHaveURL(/\/admin\/bookings\/[0-9a-f-]{36}$/);
  const bookingId = page.url().split("/").pop() ?? "";
  const { data: quoted } = await adminApi().from("bookings").select("status, inquiry_id, total").eq("id", bookingId).single();
  expect(quoted).toMatchObject({ status: "quoted", inquiry_id: open.id, total: 70_000_000 });
  expect((await inquiryRow(open.id)).status).toBe("quoted");

  // A seller cannot open an inquiry someone else owns.
  await page.goto(`/admin/inquiries/${owned.id}`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("a sales manager sees every inquiry and assigns one another person owns", async ({ page }) => {
  test.setTimeout(90_000);
  await signInAs(page, "sales_manager");
  await page.goto(`/admin/inquiries?q=${owned.code}`);
  await expect(page.getByRole("row").filter({ hasText: owned.code })).toContainText("Sample admin");
  await page.getByRole("link", { name: owned.code }).click();
  const assign = page.getByRole("form", { name: "Người phụ trách" });
  await assign.getByLabel("Giao cho").selectOption({ label: "Sample sales" });
  await assign.getByRole("button", { name: "Lưu người phụ trách" }).click();
  await expect.poll(async () => (await inquiryRow(owned.id)).assigned_to).toBe(await profileId("sales@example.test"));
  await expect(page.getByTestId("inquiry-history").locator('li[data-action="inquiries.assign"]')).toContainText("Sample admin → Sample sales");

  const status = page.getByRole("form", { name: "Trạng thái" });
  await status.getByLabel("Trạng thái mới").selectOption({ label: "Thư rác" });
  await status.getByRole("button", { name: "Cập nhật trạng thái" }).click();
  await expect.poll(async () => (await inquiryRow(owned.id)).status).toBe("spam");
  // Marking spam is not a response to the customer.
  expect((await inquiryRow(owned.id)).first_responded_at).toBeNull();
  await expectNoSeriousViolations(page, "/admin/inquiries/[id] (sales manager)");
});

test("operators read inquiries without any action", async ({ page }) => {
  await signInAs(page, "operator");
  await page.goto(`/admin/inquiries/${open.id}`);
  await expect(page.getByRole("heading", { level: 1, name: open.code })).toBeVisible();
  await expect(page.getByText("Bạn chỉ có quyền xem yêu cầu này.")).toBeVisible();
  await expect(page.getByRole("form", { name: "Thêm ghi chú" })).toHaveCount(0);
});

test("an MFA-verified accountant has no inquiry inbox", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `inq-accountant-${stamp}@example.test`;
  const password = `e2e-inq-${stamp}-Aa1!`;
  const created = await adminApi().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const { error } = await adminApi().from("profiles").update({ role: "accountant", full_name: "Kế toán hộp thư" }).eq("id", created.data.user.id);
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
  const menu = page.getByRole("navigation", { name: "Điều hướng quản trị" });
  await expect(menu.getByRole("link", { name: "Đặt tour" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Yêu cầu tư vấn" })).toHaveCount(0);
  await page.goto("/admin/inquiries");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});
