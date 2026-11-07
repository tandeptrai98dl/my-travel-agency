import { expect, type Page, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";
import { booking, closeTestDepartures, heldBooking, testDeparture } from "./support/booking";
import { totp } from "./support/totp";

// Admin bookings and payments (docs/specs/phase-4-booking-payments.md PR 4F, steps 16–18), per
// role. The accountant flows use their own account with TOTP, so they never touch the seeded ones.

const stamp = `${Date.now()}`;
const password = `e2e-acc-${stamp}-Aa1!`;

test.describe.configure({ mode: "serial", retries: 0 });
test.afterAll(closeTestDepartures);

async function openBooking(page: Page, code: string) {
  await page.goto("/admin/bookings");
  await page.getByLabel("Mã đặt tour hoặc email").fill(code);
  await page.getByRole("button", { name: "Lọc" }).click();
  await page.getByRole("link", { name: code, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: code })).toBeVisible();
}

test("editors have no bookings or payments", async ({ page }) => {
  await signInAs(page, "editor");
  const menu = page.getByRole("navigation", { name: "Điều hướng quản trị" });
  await expect(menu.getByRole("link", { name: "Đặt tour" })).toHaveCount(0);
  for (const path of ["/admin/bookings", "/admin/payments", "/admin/bookings/attention"]) {
    await page.goto(path);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  }
});

test("sales request a cancellation, an operator cancels and the queue follows", async ({ page }) => {
  test.setTimeout(90_000);
  const departure = await testDeparture(4);
  const held = await heldBooking(departure, "bank_transfer");
  const { code } = await booking(held.bookingId);

  await signInAs(page, "sales");
  await page.getByRole("navigation", { name: "Điều hướng quản trị" }).getByRole("link", { name: "Đặt tour" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Đặt tour" })).toBeVisible();
  await expectNoSeriousViolations(page, "/admin/bookings (sales)");
  await openBooking(page, code);
  await expectNoSeriousViolations(page, "/admin/bookings/[id] (sales)");
  // Sales never see money actions or the cancel button itself.
  await expect(page.getByRole("form", { name: "Ghi nhận thanh toán" })).toHaveCount(0);
  await expect(page.getByRole("form", { name: "Huỷ đặt tour" })).toHaveCount(0);
  const request = page.getByRole("form", { name: "Yêu cầu huỷ" });
  await request.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(request.getByText("Hãy ghi chú ít nhất 3 ký tự.")).toBeVisible();
  await request.getByLabel("Ghi chú (bắt buộc)").fill("Khách gọi điện xin huỷ");
  await request.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect.poll(async () => (await booking(held.bookingId)).attention_reason).toBe("cancel_requested");
  await page.goto("/admin/bookings/attention");
  await expect(page.getByRole("link", { name: `Mở ${code}` })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "operator");
  await openBooking(page, code);
  await expect(page.getByText("Cần xử lý: Yêu cầu huỷ")).toBeVisible();
  const cancel = page.getByRole("form", { name: "Huỷ đặt tour" });
  await cancel.getByLabel("Lý do huỷ").fill("Theo yêu cầu của khách");
  await cancel.getByRole("button", { name: "Huỷ đặt tour" }).click();
  await expect(cancel.getByText(`Huỷ đặt tour ${code}?`)).toBeVisible();
  await cancel.getByRole("button", { name: "Huỷ đặt tour" }).click();
  await expect.poll(async () => (await booking(held.bookingId)).status).toBe("cancelled");
  const { data: seats } = await adminApi().from("departures").select("seats_reserved").eq("id", departure.departureId).single();
  expect(seats?.seats_reserved).toBe(0);
  await expect(page.getByText("Theo yêu cầu của khách").first()).toBeVisible();

  // The operator clears the request from the queue with a note.
  const resolve = page.getByRole("form", { name: "Đánh dấu đã xử lý" });
  await resolve.getByLabel("Đã làm gì?").fill("Đã huỷ, khách chưa trả tiền");
  await resolve.getByRole("button", { name: "Đánh dấu đã xử lý" }).click();
  await expect.poll(async () => (await booking(held.bookingId)).needs_attention).toBe(false);
});

test("an MFA-verified accountant records money, refunds within the cap and assigns a transfer", async ({ page }) => {
  test.setTimeout(150_000);
  const departure = await testDeparture(4);
  const cash = await heldBooking(departure, "bank_transfer");
  const wrongMemo = await heldBooking(departure, "bank_transfer");
  const cashCode = (await booking(cash.bookingId)).code;
  const memoCode = (await booking(wrongMemo.bookingId)).code;
  const eventKey = `sepay:e2e-${stamp}`;
  const unmatched = await adminApi().rpc("record_payment_event", {
    provider: "bank_transfer",
    event_key: eventKey,
    payload: { id: `e2e-${stamp}`, transferType: "in", transferAmount: departure.price, content: `chuyen tien tour ${stamp}` },
    reference: "",
    amount: departure.price,
    provider_txn_id: eventKey,
    succeeded: true,
  });
  expect(unmatched.error).toBeNull();

  const email = `accountant-${stamp}@example.test`;
  const created = await adminApi().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const { error } = await adminApi().from("profiles").update({ role: "accountant", full_name: "Kế toán E2E" }).eq("id", created.data.user.id);
  if (error) throw error;

  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await page.getByRole("button", { name: "Bắt đầu thiết lập" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())?.trim() ?? "";
  await page.getByLabel("Mã xác thực").fill(totp(secret));
  await page.getByRole("button", { name: "Xác minh" }).click();
  await page.getByRole("button", { name: "Vào trang quản trị" }).click();
  await expect(page.getByTestId("work-unmatched")).toBeVisible();

  // Cash at the office: confirmed through the same rules as a gateway.
  await openBooking(page, cashCode);
  await expectNoSeriousViolations(page, "/admin/bookings/[id] (accountant)");
  const record = page.getByRole("form", { name: "Ghi nhận thanh toán" });
  await record.getByLabel("Phương thức").selectOption("cash");
  await record.getByRole("button", { name: "Ghi nhận" }).click();
  await expect(record.getByText("Hãy ghi chú ít nhất 3 ký tự.")).toBeVisible();
  await record.getByLabel("Ghi chú (bắt buộc)").fill("Khách trả tiền mặt tại văn phòng");
  await record.getByRole("button", { name: "Ghi nhận" }).click();
  await expect.poll(async () => (await booking(cash.bookingId)).status).toBe("confirmed");
  await expect(page.getByText("Ghi nhận bởi Kế toán E2E").first()).toBeVisible();

  // Refunds are capped at what was received.
  await page.reload();
  const refund = page.getByRole("form", { name: "Hoàn tiền" });
  await refund.getByLabel("Số tiền (VND)").fill(String(departure.price + 1));
  await refund.getByLabel("Ghi chú (bắt buộc)").fill("Hoàn quá số tiền");
  await refund.getByRole("button", { name: "Ghi nhận hoàn tiền" }).click();
  await expect(refund.getByText("Số tiền hoàn lớn hơn số tiền đã nhận.")).toBeVisible();
  await refund.getByLabel("Số tiền (VND)").fill("1.000.000");
  await refund.getByLabel("Ghi chú (bắt buộc)").fill("Hoàn một phần theo thoả thuận");
  await refund.getByRole("button", { name: "Ghi nhận hoàn tiền" }).click();
  await expect.poll(async () => (await booking(cash.bookingId)).payment_state).toBe("partially_refunded");
  expect((await booking(cash.bookingId)).amount_paid).toBe(departure.price - 1_000_000);

  // The transfer without a reference, assigned by booking code.
  await page.goto("/admin/payments");
  await expectNoSeriousViolations(page, "/admin/payments (accountant)");
  const transfer = page.getByRole("form", { name: new RegExp(`chuyen tien tour ${stamp}`) });
  await transfer.getByLabel("Mã đặt tour").fill(memoCode);
  await transfer.getByLabel("Ghi chú (bắt buộc)").fill("Khách gửi biên lai qua Zalo");
  await transfer.getByRole("button", { name: "Gán" }).click();
  await expect.poll(async () => (await booking(wrongMemo.bookingId)).status).toBe("confirmed");
  const { data: event } = await adminApi().from("webhook_events").select("error").eq("event_key", eventKey).single();
  expect(event?.error).toBe("assigned");

  // The ledger shows both manual rows.
  await page.getByLabel("Mã tham chiếu hoặc mã đặt tour").fill(cashCode);
  await page.getByRole("button", { name: "Lọc" }).click();
  await expect(page.getByRole("cell", { name: /Khách trả tiền mặt tại văn phòng/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Hoàn một phần theo thoả thuận/ })).toBeVisible();
});
