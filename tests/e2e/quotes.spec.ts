import { expect, test } from "@playwright/test";

import { adminApi } from "./support/admin-api";
import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";

// Phase 4 PR 4D (docs/specs/phase-4-booking-payments.md steps 13–14): sales quote a private trip,
// send a single-use payment link, and the customer pays it through the standard checkout (CI's
// VNPay stub signs the IPN).

test.describe.configure({ mode: "serial", retries: 0 });

let linkPath = "";
let bookingId = "";
const email = `quote-${Date.now()}@example.test`;

test("sales create a quote and a payment link", async ({ page }) => {
  test.setTimeout(90_000);
  await signInAs(page, "sales");
  await page.goto("/admin/bookings");
  await page.getByRole("link", { name: "Tạo báo giá" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tạo báo giá" })).toBeVisible();
  await expectNoSeriousViolations(page, "/admin/bookings/new");

  const form = page.getByRole("form", { name: "Tạo báo giá" });
  await form.getByRole("button", { name: "Tạo báo giá" }).click();
  await expect(form.getByText("Nhập số tiền nguyên dương (VND).").first()).toBeVisible();
  await form.getByLabel("Giá mỗi người lớn (VND)").fill("20.000.000");
  await form.getByLabel("Họ tên khách").fill("Anna Berg");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Điện thoại").fill("+46 70 000 00 00");
  await form.getByRole("button", { name: "Tạo báo giá" }).click();

  await expect(page).toHaveURL(/\/admin\/bookings\/[0-9a-f-]{36}$/);
  bookingId = page.url().split("/").pop() ?? "";
  const { data } = await adminApi().from("bookings").select("status, total, deposit_amount").eq("id", bookingId).single();
  expect(data).toMatchObject({ status: "quoted", total: 40_000_000, deposit_amount: 12_000_000 });

  const link = page.getByRole("form", { name: "Liên kết thanh toán" });
  await link.getByRole("button", { name: "Tạo liên kết" }).click();
  const url = (await page.getByTestId("payment-link-url").textContent())?.trim() ?? "";
  expect(url).toMatch(/\/thanh-toan\/link\/[A-Za-z0-9_-]{43}$/);
  linkPath = new URL(url).pathname;
  const { data: rows } = await adminApi().from("payment_links").select("token_hash, amount").eq("booking_id", bookingId);
  expect(rows).toHaveLength(1);
  expect(rows?.[0].amount).toBe(12_000_000);
  // Only the hash is stored.
  expect(rows?.[0].token_hash).not.toContain(linkPath.split("/").pop());
  // 4E: the link is emailed to the customer (Resend is off in CI: a `skipped` row), and the
  // token is in no column of the log.
  await expect(page.getByTestId("payment-link-email")).toHaveAttribute("data-state", "skipped");
  // Sent after the action answered (#36 review): poll for the row.
  const { data: quoted } = await adminApi().from("bookings").select("contact_email").eq("id", bookingId).single();
  const logged = async () => (await adminApi().from("email_logs").select("*").eq("booking_id", bookingId)).data ?? [];
  await expect
    .poll(async () => (await logged()).map((row) => `${row.template}:${row.status}:${row.to_email}`), { timeout: 15_000 })
    .toEqual([`payment_link:skipped:${quoted!.contact_email}`]);
  expect(JSON.stringify(await logged())).not.toContain(linkPath.split("/").pop());
  // The booking page lists it; a payment link is never offered for resend (its token is not stored).
  await page.reload();
  const row = page.getByTestId("booking-emails").locator('li[data-template="payment_link"]');
  await expect(row).toHaveAttribute("data-status", "skipped");
  await expect(row.getByRole("button", { name: /Gửi lại/ })).toHaveCount(0);
});

test("the customer pays the quote from the link, which then works no more", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(linkPath);
  await expect(page.getByTestId("pay-link")).toHaveAttribute("data-state", "valid");
  await expectNoSeriousViolations(page, "/thanh-toan/link/[token]");
  await page.getByRole("button", { name: "Tiếp tục thanh toán" }).click();
  await expect(page).toHaveURL(/\/thanh-toan\/PTA-\d{4}-\d{4,}\/phuong-thuc$/);

  await page.getByRole("radio", { name: /VNPay/ }).check();
  await page.getByRole("button", { name: /^Thanh toán/ }).click();
  await expect(page).toHaveURL(/\/api\/payments\/vnpay\/stub\?/);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.getByTestId("checkout-result")).toHaveAttribute("data-status", "confirmed", { timeout: 20_000 });
  const { data } = await adminApi().from("bookings").select("status, amount_paid").eq("id", bookingId).single();
  expect(data).toMatchObject({ status: "confirmed", amount_paid: 12_000_000 });

  const other = await browser.newContext();
  const again = await other.newPage();
  await again.goto(linkPath);
  await expect(again.getByTestId("pay-link")).toHaveAttribute("data-state", "used");
  await expect(again.getByRole("link", { name: "Mở trang thanh toán của đặt chỗ" })).toHaveCount(0);
  // The browser that used the link still holds the booking's access cookie: it gets the checkout.
  await page.goto(linkPath);
  await expect(page.getByTestId("pay-link")).toHaveAttribute("data-state", "used");
  await page.getByRole("link", { name: "Mở trang thanh toán của đặt chỗ" }).click();
  await expect(page).toHaveURL(/\/thanh-toan\/PTA-\d{4}-\d{4,}$/);
  await context.close();
  await other.close();
});

test("sales resend the confirmation from the booking page with a fresh key", async ({ page }) => {
  test.setTimeout(60_000);
  await signInAs(page, "sales");
  await page.goto(`/admin/bookings/${bookingId}`);
  const row = page.getByTestId("booking-emails").locator('li[data-template="booking_confirmed"]').first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "Gửi lại: Xác nhận đặt chỗ" }).click();
  await expect
    .poll(
      async () =>
        ((await adminApi().from("email_logs").select("dedupe_key, status").eq("booking_id", bookingId).like("dedupe_key", "booking_confirmed:%:resend:%")).data ?? []).map(
          (item) => item.status,
        ),
      { timeout: 15_000 },
    )
    .toEqual(["skipped"]);
  await page.reload();
  await expect(page.getByText("Gửi lại email").first()).toBeVisible();
});
