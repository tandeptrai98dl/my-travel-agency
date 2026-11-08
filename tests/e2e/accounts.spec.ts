import { expect, type Page, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { expectNoSeriousViolations } from "./support/axe";
import { closeTestDepartures, testDeparture } from "./support/booking";

// Phase 5 PR 5A (docs/specs/phase-5-accounts-inquiries-operations.md step 5): a customer signs up
// through the Mailpit confirmation, finds an earlier guest booking attached, reads it without
// internal fields, edits travellers and changes the password (other sessions signed out); another
// customer's code shows nothing; the reset page needs a recovery link; the starter sign-up path
// redirects. Every page runs under the secure root's nonce CSP (the shared guard fails on any
// violation).

test.describe.configure({ mode: "serial", retries: 0 });
test.afterAll(closeTestDepartures);

const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const email = `acct-${stamp}@example.test`;
const password = `e2e-account-${stamp}-Aa1`;
const newPassword = `${password}-new`;
let ownCode = "";
let otherCode = "";
let idempotencyKey = "";

async function guestBooking(contactEmail: string, key: string): Promise<string> {
  const departure = await testDeparture(10);
  const db = adminApi();
  const created = await db.rpc("create_draft_booking", {
    payload: {
      idempotency_key: key,
      tour_id: departure.tourId,
      departure_id: departure.departureId,
      locale: "vi",
      adults: 2,
      children: 0,
      infants: 0,
      single_rooms: 0,
      contact_name: "Khách tài khoản",
      contact_email: contactEmail,
      contact_phone: "+84 900 000 001",
      payment_plan: "full",
      subtotal: departure.price * 2,
      total: departure.price * 2,
      deposit_amount: departure.price * 2,
      items: [{ type: "adult", unit_price: departure.price, quantity: 2, amount: departure.price * 2 }],
      utm: { source: "e2e-secret-utm" },
    },
  });
  if (created.error || !created.data) throw created.error ?? new Error("no draft");
  const { data, error } = await db.from("bookings").select("code").eq("id", created.data).single();
  if (error) throw error;
  return data.code;
}

/** The newest Auth email to an address, as a path on the app under test. */
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

async function signIn(page: Page, address: string, secret: string) {
  await page.goto("/dang-nhap");
  const form = page.getByTestId("login-form");
  await form.getByLabel("Email").fill(address);
  await form.getByLabel("Mật khẩu", { exact: true }).fill(secret);
  await form.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/tai-khoan$/);
}

test("a guest's earlier booking is attached after sign-up and email confirmation", async ({ page }) => {
  idempotencyKey = `acct-${stamp}`;
  ownCode = await guestBooking(email.toUpperCase(), idempotencyKey);
  otherCode = await guestBooking(`other-${stamp}@example.test`, `acct-other-${stamp}`);

  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dang-ky");
    await expect(page.getByRole("heading", { level: 1, name: "Tạo tài khoản" })).toBeVisible();
    await expectNoSeriousViolations(page, `sign-up at ${width}`);
  }

  const form = page.getByTestId("register-form");
  await form.getByLabel("Họ và tên").fill("Khách Tài Khoản");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Mật khẩu").fill("short");
  await form.getByRole("button", { name: "Tạo tài khoản" }).click();
  // Field errors come back from the server and are linked to their fields.
  await expect(form.getByText("Mật khẩu cần ít nhất 10 ký tự.")).toBeVisible();
  await expect(form.getByText("Vui lòng đồng ý với chính sách bảo mật.")).toBeVisible();

  await form.getByLabel("Mật khẩu").fill(password);
  await form.getByLabel(/Tôi đồng ý với/).check();
  await form.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByRole("status").filter({ hasText: "chúng tôi đã gửi liên kết xác nhận" })).toBeVisible();

  // Before confirming, nothing is attached.
  const { data: before } = await adminApi().from("bookings").select("customer_id").eq("code", ownCode).single();
  expect(before?.customer_id).toBeNull();

  await page.goto(await emailLinkPath(email));
  await expect(page).toHaveURL(/\/tai-khoan$/);
  await expect(page.getByRole("heading", { level: 1, name: "Xin chào, Khách Tài Khoản" })).toBeVisible();
  await expect(page.getByText(ownCode, { exact: true })).toBeVisible();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSeriousViolations(page, `account overview at ${width}`);
  }
});

test("the booking detail shows no internal fields, and travellers can be edited", async ({ page }) => {
  await signIn(page, email, password);
  await page.goto("/tai-khoan/booking");
  await page.getByRole("link", { name: new RegExp(`Xem booking ${ownCode}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/tai-khoan/booking/${ownCode}$`));
  const body = (await page.locator("main").textContent()) ?? "";
  expect(body).toContain(ownCode);
  expect(body).not.toContain(idempotencyKey);
  expect(body).not.toContain("e2e-secret-utm");

  const form = page.getByTestId("travellers-form");
  await form.getByLabel("Họ và tên").first().fill("Nguyễn Văn Đại Diện");
  await form.getByLabel("Quốc tịch").first().fill("Việt Nam");
  await form.getByRole("button", { name: "Thêm hành khách" }).click();
  await form.getByLabel("Họ và tên").nth(1).fill("Trần Thị Hai");
  await form.getByRole("button", { name: "Lưu hành khách" }).click();
  await expect(form.getByRole("status")).toHaveText("Đã lưu thông tin hành khách.");
  // At most the party (two adults): the add button is gone.
  await expect(form.getByRole("button", { name: "Thêm hành khách" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("travellers-form").getByLabel("Họ và tên").first()).toHaveValue("Nguyễn Văn Đại Diện");
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSeriousViolations(page, `booking detail at ${width}`);
  }

  // Another customer's booking looks like one that does not exist.
  await page.goto(`/tai-khoan/booking/${otherCode}`);
  await expect(page.getByRole("heading", { level: 1, name: "Không tìm thấy trang" })).toBeVisible();
  await expect(page.getByText(otherCode)).toHaveCount(0);
});

test("the reset page needs a recovery link; a password change signs other sessions out", async ({ page, browser }) => {
  await signIn(page, email, password);
  await page.goto("/dat-lai-mat-khau");
  await expect(page.getByRole("heading", { level: 1, name: "Liên kết đã hết hạn" })).toBeVisible();
  await expect(page.getByLabel("Mật khẩu mới")).toHaveCount(0);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, email, password);

  await page.goto("/tai-khoan/ho-so");
  const form = page.getByTestId("password-form");
  await form.getByLabel("Mật khẩu hiện tại").fill(password);
  await form.getByLabel("Mật khẩu mới", { exact: true }).fill(newPassword);
  await form.getByLabel("Nhập lại mật khẩu mới").fill(newPassword);
  await form.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(form.getByRole("status")).toHaveText("Đã lưu.");
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSeriousViolations(page, `profile at ${width}`);
  }

  // The other device lost its session; this one keeps working.
  await otherPage.goto("/tai-khoan");
  await expect(otherPage).toHaveURL(/\/dang-nhap\?next=/);
  await other.close();
  await page.goto("/tai-khoan");
  await expect(page).toHaveURL(/\/tai-khoan$/);

  // The old password no longer works; the new one does.
  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await freshPage.goto("/dang-nhap");
  const login = freshPage.getByTestId("login-form");
  await login.getByLabel("Email").fill(email);
  await login.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await login.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(login.getByRole("status")).toHaveText("Email hoặc mật khẩu chưa đúng.");
  await signIn(freshPage, email, newPassword);
  await fresh.close();
});

test("signed-out requests to the account pages are redirected to sign-in by the server", async ({ page, request, baseURL }) => {
  // docs/QA_REPORT.md: the redirect used to be streamed and done on the client (about 3.8 s and
  // CLS 0.573 in Lighthouse). The proxy now answers before rendering; the pages still check.
  for (const [path, location] of [
    ["/tai-khoan", "/dang-nhap?next=%2Ftai-khoan"],
    ["/tai-khoan/booking", "/dang-nhap?next=%2Ftai-khoan%2Fbooking"],
    ["/tai-khoan/booking/PTA-2611-0001", "/dang-nhap?next=%2Ftai-khoan%2Fbooking%2FPTA-2611-0001"],
    ["/tai-khoan/ho-so", "/dang-nhap?next=%2Ftai-khoan%2Fho-so"],
    ["/en/account", "/en/login?next=%2Fen%2Faccount"],
    ["/en/account/bookings?page=2", "/en/login?next=%2Fen%2Faccount%2Fbookings%3Fpage%3D2"],
    ["/en/account/profile", "/en/login?next=%2Fen%2Faccount%2Fprofile"],
  ] as const) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    const target = new URL(response.headers()["location"]!, "http://localhost:3000");
    expect(`${target.pathname}${target.search}`, path).toBe(location);
    expect(response.headers()["cache-control"], path).toContain("no-store");
  }
  // A cookie that only looks like a session skips the shortcut; the page itself still refuses it.
  const forged = await request.get("/tai-khoan", { maxRedirects: 0, headers: { cookie: "sb-forged-auth-token=forged" } });
  expect(forged.status()).toBe(200);
  await page.context().addCookies([{ name: "sb-forged-auth-token", value: "forged", url: baseURL! }]);
  await page.goto("/tai-khoan");
  await expect(page).toHaveURL(/\/dang-nhap\?next=%2Ftai-khoan$/);
});

test("signed-out visitors go to sign-in; staff sign-up redirects; the sign-in page is accessible", async ({ page, request }) => {
  await page.goto("/tai-khoan/booking");
  await expect(page).toHaveURL(/\/dang-nhap\?next=%2Ftai-khoan%2Fbooking$/);
  await page.goto("/en/account");
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Faccount$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSeriousViolations(page, `sign-in at ${width}`);
  }
  for (const path of ["/auth/sign-up", "/auth/sign-up-success"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(308);
    expect(new URL(response.headers()["location"]!, "http://localhost:3000").pathname).toBe("/dang-ky");
  }
  // The secure pages carry the nonce policy, not the public one.
  const login = await request.get("/dang-nhap");
  expect(login.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
});
