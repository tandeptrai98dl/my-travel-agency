import { expect, type Page, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { closeTestDepartures, testDeparture } from "./support/booking";
import type { GoogleTraffic } from "./support/google";

// Phase 6 PR 6P (docs/specs/phase-6-hardening-launch.md step 10, ADR-039): GA4 through gtag.js
// only after consent, Consent Mode v2, page views with route templates, the five events and no
// code or token in anything Google receives. CI builds with a fake measurement ID; every Google
// request is answered locally by support/google.ts, never by Google.

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
test.skip(!MEASUREMENT_ID, "needs NEXT_PUBLIC_GA_MEASUREMENT_ID at build time (CI sets a fake one)");
test.afterAll(closeTestDepartures);

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/;

async function grantAnalyticsOnly(page: Page) {
  const banner = page.getByRole("region", { name: "Cookies on this website" });
  await banner.getByRole("button", { name: "Customise" }).click();
  const dialog = page.getByRole("dialog", { name: "Cookie settings" });
  await dialog.getByRole("switch", { name: "Analytics" }).click();
  await dialog.getByRole("button", { name: "Save my choices" }).click();
  await expect(dialog).toBeHidden();
}

/** A consent cookie with analytics granted and a record id, as the banner writes it. */
async function presetAnalyticsConsent(page: Page, baseURL: string) {
  await page.context().addCookies([{ name: "consent", value: "v1.a1.m0.0f8b9c1e-2d3a-4b5c-8d6e-7f8091a2b3c4", url: baseURL }]);
}

const events = (google: GoogleTraffic, name: string) => google.hits().filter((hit) => hit.searchParams.get("en") === name);

/** Nothing Google receives carries the booking code, a token or the consent id. */
function expectClean(google: GoogleTraffic, secrets: string[]) {
  for (const url of google.requests) {
    const decoded = decodeURIComponent(url);
    for (const secret of secrets) expect(decoded, url).not.toContain(secret);
    expect(decoded, url).not.toMatch(UUID);
  }
}

test("no Google request before a choice, none with essential only", async ({ page, google }) => {
  await page.goto("/en/tours");
  const banner = page.getByRole("region", { name: "Cookies on this website" });
  await expect(banner).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(google.requests).toEqual([]);

  await banner.getByRole("button", { name: "Essential only" }).click();
  await page.goto("/en");
  await page.waitForLoadState("networkidle");
  expect(google.requests).toEqual([]);
});

test("granting analytics loads gtag.js and sends templates; withdrawing stops everything", async ({ page, google, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await page.goto("/en/tours");
  await expect(page.locator('main a[href^="/en/tours/"]').first()).toBeVisible();
  expect(google.requests).toEqual([]);

  await grantAnalyticsOnly(page);
  // gtag.js from the Tag Manager host, then the manual page_view with the template.
  await expect.poll(() => google.requests.some((url) => url.startsWith(`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`))).toBe(true);
  await expect.poll(() => events(google, "page_view").length).toBe(1);
  const [view] = events(google, "page_view");
  expect(view.searchParams.get("tid")).toBe(MEASUREMENT_ID);
  expect(view.searchParams.get("dl")).toBe(`${origin}/tours`);
  expect(view.searchParams.get("dr")).toBe("");
  // The listing's event, queued before the choice, follows its page view.
  await expect.poll(() => events(google, "view_item_list").length).toBe(1);
  expect(events(google, "view_item_list")[0].searchParams.get("ep.item_list_id")).toBe("tours");

  // Consent Mode v2 order in the data layer: default denied, update, then config without a page view.
  const layer = await page.evaluate(() => ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) => JSON.stringify(Array.from(entry))));
  const index = (prefix: string) => layer.findIndex((entry) => entry.startsWith(prefix));
  expect(layer[index('["consent","default"')]).toContain('"analytics_storage":"denied"');
  expect(layer[index('["consent","update"')]).toBe(
    '["consent","update",{"analytics_storage":"granted","ad_storage":"denied","ad_user_data":"denied","ad_personalization":"denied"}]',
  );
  expect(layer.some((entry) => entry === '["set","ads_data_redaction",true]')).toBe(true);
  expect(index('["consent","default"')).toBeLessThan(index('["consent","update"'));
  expect(index('["consent","update"')).toBeLessThan(index('["config"'));
  expect(layer[index('["config"')]).toContain('"send_page_view":false');

  // A client-side navigation to a tour: its template, with the listing's template as referrer.
  await page.locator('main a[href^="/en/tours/"]').first().click();
  await expect(page).toHaveURL(/\/en\/tours\/[^/?]+$/);
  await expect.poll(() => events(google, "page_view").length).toBe(2);
  const tourView = events(google, "page_view")[1];
  expect(tourView.searchParams.get("dl")).toBe(`${origin}/tours/[slug]`);
  expect(tourView.searchParams.get("dr")).toBe(`${origin}/tours`);
  await expect.poll(() => events(google, "view_item").length).toBe(1);
  expect(events(google, "view_item")[0].searchParams.get("ep.currency")).toBe("VND");
  const slug = new URL(page.url()).pathname.split("/").pop()!;
  expectClean(google, [slug]);

  // Withdrawal from the footer: nothing more is sent, and the _ga cookies are removed.
  await page.evaluate(() => {
    document.cookie = "_ga=GA1.1.123.456; Path=/";
    document.cookie = "_ga_TEST=GS1.1.1; Path=/";
  });
  const before = google.requests.length;
  await page.getByRole("contentinfo").getByRole("button", { name: "Cookie settings" }).click();
  await page.getByRole("dialog", { name: "Cookie settings" }).getByRole("button", { name: "Essential only" }).click();
  await expect.poll(async () => (await page.context().cookies()).filter((cookie) => cookie.name.startsWith("_ga")).length).toBe(0);
  const layerAfter = await page.evaluate(() => ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) => JSON.stringify(Array.from(entry))));
  expect(layerAfter.at(-1)).toBe('["consent","update",{"analytics_storage":"denied","ad_storage":"denied","ad_user_data":"denied","ad_personalization":"denied"}]');
  // A client-side navigation (the loader stays in memory): still nothing.
  await page.locator('header a[href="/en/tours"]').first().click();
  await expect(page).toHaveURL(/\/en\/tours$/);
  await page.waitForLoadState("networkidle");
  expect(google.requests.length).toBe(before);
});

test("a choice is recorded, or retried once on the next page view when it cannot be", async ({ page }) => {
  await page.goto("/en");
  const action = page.waitForRequest((request) => request.method() === "POST" && Boolean(request.headers()["next-action"]));
  await page.getByRole("region", { name: "Cookies on this website" }).getByRole("button", { name: "Accept all" }).click();
  const body = (await action).postData() ?? "";
  // The record carries the pseudonymous id from the cookie, the action and the choices; the
  // banner version is computed on the server.
  const consent = (await page.context().cookies()).find((cookie) => cookie.name === "consent")!;
  const id = consent.value.split(".")[3];
  expect(body).toContain(id);
  expect(body).toContain("accept_all");
  expect(body).not.toContain("banner-");
  // CI has no Upstash, so the rate limit fails closed and the record waits for its one retry.
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("consent-retry"))).not.toBeNull();
  await page.goto("/en/tours");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("consent-retry"))).toBeNull();
});

test("GA is not loaded at all on payment links, booking lookup, the account or an emailed link", async ({ page, google, baseURL }) => {
  await presetAnalyticsConsent(page, baseURL!);
  // The control: a public page with the same consent does load gtag.js.
  await page.goto("/en/faq");
  await expect.poll(() => events(google, "page_view").length).toBe(1);
  await page.waitForLoadState("networkidle");
  google.requests.length = 0;

  for (const path of [
    `/en/pay/${"t".repeat(43)}`,
    `/thanh-toan/link/${"t".repeat(43)}`,
    "/tra-cuu-booking",
    "/en/booking-lookup",
    "/en/login",
    "/tai-khoan",
    `/thanh-toan/PTA-2611-0001?access=${"a".repeat(43)}`,
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(google.requests, path).toEqual([]);
  }
});

test("checkout sends templates only, and purchase once per booking", async ({ page, google, baseURL }) => {
  test.skip(!process.env.BOOKING_ACCESS_SECRET || process.env.VNPAY_STUB !== "true", "needs the CI booking settings");
  test.setTimeout(120_000);
  const origin = new URL(baseURL!).origin;
  await presetAnalyticsConsent(page, baseURL!);
  const departure = await testDeparture(4);
  const { data: tour, error } = await adminApi()
    .from("tour_translations")
    .select("slug, tours!inner(code)")
    .eq("locale", "vi")
    .eq("tours.code", "VN-HLB-03")
    .single();
  expect(error).toBeNull();

  await page.goto(`/dat-tour/${tour!.slug}?departure=${departure.departureId}&adults=1`);
  await expect.poll(() => events(google, "begin_checkout").length).toBe(1);
  expect(events(google, "page_view")[0].searchParams.get("dl")).toBe(`${origin}/book/[tourSlug]`);
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByLabel("Họ và tên").fill("Lê Minh Châu");
  const email = `ga-${Date.now()}@example.test`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Số điện thoại").fill("+84 912 000 222");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByLabel("Thanh toán toàn bộ").check();
  await page.getByRole("checkbox", { name: /Tôi đồng ý với/ }).click();
  await page.getByRole("button", { name: "Tiếp tục thanh toán" }).click();
  await expect(page).toHaveURL(/\/thanh-toan\/PTA-\d{4}-\d{4,}\/phuong-thuc$/);
  const code = decodeURIComponent(new URL(page.url()).pathname.split("/")[2]);
  await expect.poll(() => events(google, "page_view").map((hit) => hit.searchParams.get("dl"))).toContain(`${origin}/checkout/[code]/payment`);

  await page.getByRole("radio", { name: /VNPay/ }).check();
  await page.getByRole("button", { name: /^Thanh toán/ }).click();
  await expect(page).toHaveURL(/\/api\/payments\/vnpay\/stub\?/);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/thanh-toan/${code}/ket-qua$`));
  await expect(page.getByTestId("checkout-result")).toHaveAttribute("data-status", "confirmed", { timeout: 20_000 });
  await expect.poll(() => events(google, "purchase").length).toBe(1);
  const [sale] = events(google, "purchase");
  expect(sale.searchParams.get("dl")).toBe(`${origin}/checkout/[code]/result`);
  expect(sale.searchParams.get("ep.transaction_id")).toMatch(/^[0-9a-f]{32}$/);
  expect(sale.searchParams.get("ep.currency")).toBe("VND");
  expect(sale.searchParams.get("ep.value")).toBe("12900000");

  // Reloading the confirmed result page sends its page view again, never a second purchase.
  await page.reload();
  await expect(page.getByTestId("checkout-result")).toHaveAttribute("data-status", "confirmed");
  await expect.poll(() => events(google, "page_view").filter((hit) => hit.searchParams.get("dl") === `${origin}/checkout/[code]/result`).length).toBe(2);
  await page.waitForLoadState("networkidle");
  expect(events(google, "purchase")).toHaveLength(1);

  // dl, dr and dt of every hit: templates or other origins only; no code, token, address or id.
  for (const hit of google.hits()) {
    for (const key of ["dl", "dr"]) {
      const value = hit.searchParams.get(key) ?? "";
      expect(value === "" || value.startsWith(`${origin}/`) || /^https:\/\/[^/]+$/.test(value), `${key}=${value}`).toBe(true);
    }
  }
  expectClean(google, [code, code.replace(/-/g, ""), email, "Lê Minh Châu"]);
});
