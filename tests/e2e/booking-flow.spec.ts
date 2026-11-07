import { expect, type Page, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { expectNoSeriousViolations } from "./support/axe";
import { closeTestDepartures, testDeparture } from "./support/booking";
import { signAccess } from "../../src/modules/booking/booking-access";

// Phase 4 PR 4B (docs/specs/phase-4-booking-payments.md steps 6–9): book a group tour as a guest,
// pay through the CI VNPay stub (its IPN is signed with the CI-only secret) and see the result,
// under the secure root's nonce CSP. Needs BOOKING_ACCESS_SECRET, VNPAY_* and VNPAY_STUB (CI).

test.describe.configure({ mode: "serial", retries: 0 });
test.afterAll(closeTestDepartures);

async function tourSlug(locale: "vi" | "en") {
  const { data, error } = await adminApi()
    .from("tour_translations")
    .select("slug, tours!inner(code)")
    .eq("locale", locale)
    .eq("tours.code", "VN-HLB-03")
    .single();
  if (error) throw error;
  return data.slug;
}

/** Collects CSP violations on every page the test opens. */
async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    const store = window as unknown as { __csp: string[] };
    store.__csp = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      store.__csp.push(`${event.violatedDirective} ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber} ${event.sample}`),
    );
  });
}
// The Sentry ingest host is in connect-src since Phase 3 PR M; the shared guard (support/test.ts)
// also fails a test on any violation.
const violations = async (page: Page) => page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);

let code = "";

/** Date, one guest and full payment, through the form, up to the payment page; returns the code. */
async function bookThroughForm(page: Page, slug: string, departureId: string) {
  await page.goto(`/dat-tour/${slug}?departure=${departureId}&adults=1`);
  await expect(page.getByTestId("booking-total")).toHaveText(/12\.900\.000/);
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByLabel("Họ và tên").fill("Nguyễn An");
  await page.getByLabel("Email").fill(`guest-${Date.now()}@example.test`);
  await page.getByLabel("Số điện thoại").fill("+84 912 000 111");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByLabel("Thanh toán toàn bộ").check();
  await page.getByRole("checkbox", { name: /Tôi đồng ý với/ }).click();
  await page.getByRole("button", { name: "Tiếp tục thanh toán" }).click();
  await expect(page).toHaveURL(/\/thanh-toan\/PTA-\d{4}-\d{4,}\/phuong-thuc$/);
  return decodeURIComponent(new URL(page.url()).pathname.split("/")[2]);
}

test("a guest books a group tour and pays through VNPay", async ({ page }) => {
  test.setTimeout(120_000);
  await watchCsp(page);
  const departure = await testDeparture(6);
  const slug = await tourSlug("vi");

  const response = await page.goto(`/dat-tour/${slug}?departure=${departure.departureId}&adults=2&children=0`);
  expect(response?.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The server's price for two adults at the departure's price.
  await expect(page.getByTestId("booking-total")).toHaveText(/25\.800\.000/);
  await expectNoSeriousViolations(page, "/dat-tour (1280)");

  await page.getByRole("button", { name: "Tăng Người lớn" }).click();
  await expect(page.getByTestId("booking-total")).toHaveText(/38\.700\.000/);
  await page.getByRole("button", { name: "Giảm Người lớn" }).click();
  await expect(page.getByTestId("booking-total")).toHaveText(/25\.800\.000/);
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  await expect(page.getByRole("main").getByRole("heading", { level: 2, name: "Liên hệ" })).toBeFocused();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByText("Vui lòng điền.").first()).toBeVisible();
  await page.getByLabel("Họ và tên").fill("Trần Thu Hà");
  await page.getByLabel("Email").fill(`guest-${Date.now()}@example.test`);
  await page.getByLabel("Số điện thoại").fill("+84 912 345 678");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  await expect(page.getByRole("main").getByRole("heading", { level: 2, name: "Xác nhận" })).toBeFocused();
  await page.getByLabel("Thanh toán toàn bộ").check();
  await page.getByRole("button", { name: "Tiếp tục thanh toán" }).click();
  await expect(page.getByText("Vui lòng đồng ý để tiếp tục.")).toBeVisible();
  await page.getByRole("checkbox", { name: /Tôi đồng ý với/ }).click();
  await expectNoSeriousViolations(page, "/dat-tour confirm step");
  await page.getByRole("button", { name: "Tiếp tục thanh toán" }).click();

  await expect(page).toHaveURL(/\/thanh-toan\/PTA-\d{4}-\d{4,}\/phuong-thuc$/);
  code = decodeURIComponent(new URL(page.url()).pathname.split("/")[2]);
  const { data: booking } = await adminApi().from("bookings").select("id, status, total, terms_version").eq("code", code).single();
  expect(booking?.status).toBe("draft");
  expect(booking?.total).toBe(25_800_000);
  // Consent for published pages only: the seeded privacy policy, and the terms when another test
  // has published a terms page (content.spec.ts may run first).
  const { data: consents } = await adminApi().from("consent_records").select("purpose, document_version").eq("booking_id", booking!.id);
  expect(consents?.find((row) => row.purpose === "privacy")?.document_version).toMatch(/^privacy-vi-[0-9a-f]{16}$/);
  if (booking?.terms_version) {
    expect(booking.terms_version).toMatch(/^terms-vi-[0-9a-f]{16}$/);
    expect(consents).toHaveLength(2);
  } else {
    expect(consents).toHaveLength(1);
  }
  await expectNoSeriousViolations(page, "/thanh-toan/[code]/phuong-thuc");

  // VNPay is the method CI offers (no receiving account is seeded). Choosing it holds the seats.
  await page.getByRole("radio", { name: /VNPay/ }).check();
  await page.getByRole("button", { name: /^Thanh toán/ }).click();
  await expect(page).toHaveURL(/\/api\/payments\/vnpay\/stub\?/);
  const { data: held } = await adminApi().from("departures").select("seats_reserved").eq("id", departure.departureId).single();
  expect(held?.seats_reserved).toBe(2);
  await page.getByRole("button", { name: "Pay", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/thanh-toan/${code}/ket-qua$`));
  await expect(page.getByTestId("checkout-result")).toHaveAttribute("data-status", "confirmed", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Đặt tour đã được xác nhận" })).toBeVisible();
  await expectNoSeriousViolations(page, "/thanh-toan/[code]/ket-qua");
  expect(await violations(page)).toEqual([]);

  // 4E: one email per booking event, logged after the commit. Resend is not configured in CI, so
  // each row is `skipped`; the confirming payment sends "confirmed", not also "payment received".
  const { data: contact } = await adminApi().from("bookings").select("contact_email").eq("id", booking!.id).single();
  const email = contact!.contact_email;
  const emails = async () => {
    const { data } = await adminApi().from("email_logs").select("template, status, to_email, dedupe_key, error").eq("booking_id", booking!.id);
    return (data ?? []).map((row) => `${row.template}:${row.status}:${row.to_email}`).sort();
  };
  await expect.poll(emails, { timeout: 15_000 }).toEqual([
    `booking_confirmed:skipped:${email}`,
    `booking_received:skipped:${email}`,
    "staff_booking_confirmed:skipped:hello@example.com",
  ]);
  // Reloading the result page polls again and mails nobody: the rows stay the same.
  await page.reload();
  await expect(page.getByTestId("checkout-result")).toHaveAttribute("data-status", "confirmed");
  expect(await emails()).toHaveLength(3);
});

test("an emailed checkout link opens the booking only after a click", async ({ browser }) => {
  const secret = process.env.BOOKING_ACCESS_SECRET;
  test.skip(!secret, "needs BOOKING_ACCESS_SECRET (CI)");
  const { data: booking } = await adminApi().from("bookings").select("id").eq("code", code).single();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/thanh-toan/${code}?access=${encodeURIComponent(signAccess(secret!, booking!.id).value)}`);
  await expect(page.getByTestId("checkout-email-link")).toBeVisible();
  await expect(page.getByText(/@example\.test/)).toHaveCount(0);
  await page.getByRole("button", { name: "Mở đặt chỗ" }).click();
  await expect(page).toHaveURL(new RegExp(`/thanh-toan/${code}$`));
  await expect(page.getByText(code).first()).toBeVisible();
  // A token for another booking opens nothing.
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await stranger.goto(`/thanh-toan/${code}?access=${encodeURIComponent(signAccess(secret!, "00000000-0000-4000-8000-000000000000").value)}`);
  await expect(stranger.getByTestId("checkout-email-link")).toHaveCount(0);
  await expect(stranger.getByText(code)).toHaveCount(0);
  await context.close();
  await other.close();
});

test("a booking code alone opens nothing", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const path of [`/thanh-toan/${code}`, `/thanh-toan/${code}/phuong-thuc`, `/en/checkout/${code}/result`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/PTA-/);
    await expect(page.getByText(code)).toHaveCount(0);
  }
  await context.close();
});

test("a price change before Pay reprices the draft, and a bank transfer shows the VietQR code", async ({ page }) => {
  test.setTimeout(120_000);
  await watchCsp(page);
  const departure = await testDeparture(4);
  const bookingCode = await bookThroughForm(page, await tourSlug("vi"), departure.departureId);
  // The departure's price changes while the customer is on the payment page (spec decision 2).
  const { error } = await adminApi().from("departures").update({ price_adult: 13_500_000 }).eq("id", departure.departureId);
  expect(error).toBeNull();

  await page.getByRole("radio", { name: /Chuyển khoản/ }).check();
  await page.getByRole("button", { name: /^Thanh toán/ }).click();
  await expect(page.getByText(/tổng mới là 13\.500\.000/)).toBeVisible();
  const { data: repriced } = await adminApi().from("bookings").select("status, total").eq("code", bookingCode).single();
  expect(repriced).toMatchObject({ status: "draft", total: 13_500_000 });

  // The next Pay goes through at the new price and shows the transfer to make.
  await page.getByRole("radio", { name: /Chuyển khoản/ }).check();
  await page.getByRole("button", { name: /^Thanh toán 13\.500\.000/ }).click();
  const panel = page.getByTestId("vietqr-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Vietcombank")).toBeVisible();
  await expect(panel.getByText(/PTA\d{10,}/)).toBeVisible();
  await expect(page.getByTestId("hold-countdown")).toBeVisible();
  await expectNoSeriousViolations(page, "/thanh-toan/[code]/phuong-thuc (VietQR)");
  const { data: held } = await adminApi().from("bookings").select("status").eq("code", bookingCode).single();
  expect(held?.status).toBe("pending_payment");
  expect(await violations(page)).toEqual([]);
});

test("the booking page works at phone width in English", async ({ page }) => {
  await watchCsp(page);
  await page.setViewportSize({ width: 375, height: 800 });
  const departure = await testDeparture(4);
  await page.goto(`/en/book/${await tourSlug("en")}?departure=${departure.departureId}&adults=1`);
  await expect(page.getByTestId("booking-total")).toHaveText(/12,900,000/);
  await expectNoSeriousViolations(page, "/en/book (375)");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
  expect(await violations(page)).toEqual([]);
});
