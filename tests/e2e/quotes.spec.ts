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
  await page.getByRole("button", { name: "Pay" }).click();
  await expect(page.getByTestId("checkout-result")).toHaveAttribute("data-status", "confirmed", { timeout: 20_000 });
  const { data } = await adminApi().from("bookings").select("status, amount_paid").eq("id", bookingId).single();
  expect(data).toMatchObject({ status: "confirmed", amount_paid: 12_000_000 });

  const other = await browser.newContext();
  const again = await other.newPage();
  await again.goto(linkPath);
  await expect(again.getByTestId("pay-link")).toHaveAttribute("data-state", "used");
  await context.close();
  await other.close();
});
