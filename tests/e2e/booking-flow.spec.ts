import { expect, type Page, test } from "@playwright/test";

import { adminApi } from "./support/admin-api";
import { expectNoSeriousViolations } from "./support/axe";
import { closeTestDepartures, testDeparture } from "./support/booking";

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
    document.addEventListener("securitypolicyviolation", (event) => store.__csp.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);

let code = "";

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

  await expect(page.getByRole("heading", { level: 2, name: "Liên hệ" })).toBeFocused();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByText("Vui lòng điền.").first()).toBeVisible();
  await page.getByLabel("Họ và tên").fill("Trần Thu Hà");
  await page.getByLabel("Email").fill(`guest-${Date.now()}@example.test`);
  await page.getByLabel("Số điện thoại").fill("+84 912 345 678");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Xác nhận" })).toBeFocused();
  await page.getByLabel("Thanh toán toàn bộ").check();
  await page.getByRole("button", { name: "Tiếp tục thanh toán" }).click();
  await expect(page.getByText("Vui lòng đồng ý để tiếp tục.")).toBeVisible();
  await page.getByRole("checkbox", { name: /Tôi đồng ý với điều khoản/ }).click();
  await expectNoSeriousViolations(page, "/dat-tour confirm step");
  await page.getByRole("button", { name: "Tiếp tục thanh toán" }).click();

  await expect(page).toHaveURL(/\/thanh-toan\/PTA-\d{4}-\d{4,}\/phuong-thuc$/);
  code = decodeURIComponent(new URL(page.url()).pathname.split("/")[2]);
  const { data: booking } = await adminApi().from("bookings").select("id, status, total, terms_version").eq("code", code).single();
  expect(booking?.status).toBe("draft");
  expect(booking?.total).toBe(25_800_000);
  expect(booking?.terms_version).toMatch(/^terms@/);
  const { count } = await adminApi().from("consent_records").select("id", { count: "exact", head: true }).eq("booking_id", booking!.id);
  expect(count).toBe(2);
  await expectNoSeriousViolations(page, "/thanh-toan/[code]/phuong-thuc");

  // VNPay is the method CI offers (no receiving account is seeded). Choosing it holds the seats.
  await page.getByRole("radio", { name: /VNPay/ }).check();
  await page.getByRole("button", { name: /^Thanh toán/ }).click();
  await expect(page).toHaveURL(/\/api\/payments\/vnpay\/stub\?/);
  const { data: held } = await adminApi().from("departures").select("seats_reserved").eq("id", departure.departureId).single();
  expect(held?.seats_reserved).toBe(2);
  await page.getByRole("button", { name: "Pay" }).click();

  await expect(page).toHaveURL(new RegExp(`/thanh-toan/${code}/ket-qua$`));
  await expect(page.getByTestId("checkout-result")).toHaveAttribute("data-status", "confirmed", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Đặt tour đã được xác nhận" })).toBeVisible();
  await expectNoSeriousViolations(page, "/thanh-toan/[code]/ket-qua");
  expect(await violations(page)).toEqual([]);
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
