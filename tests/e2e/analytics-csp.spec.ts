import { expect, test } from "./support/test";

// Google's hosts in the secure root's nonce policy only where GA may load: book, checkout and its
// payment and result pages (Phase 6 spec decision 7; #55 review m4). The payment link, booking
// lookup, customer sign-in and the account have no Google host at all. Public pages keep them
// (public-headers.spec.ts), the admin never has them (csp.spec.ts).

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
test.skip(!MEASUREMENT_ID, "needs NEXT_PUBLIC_GA_MEASUREMENT_ID at build time (CI sets a fake one)");

const GOOGLE = /google-analytics\.com|analytics\.google\.com|googletagmanager\.com/;

const policyOf = async (request: import("@playwright/test").APIRequestContext, path: string) => {
  const response = await request.get(path, { maxRedirects: 0 });
  const policies = response.headersArray().filter((header) => header.name.toLowerCase() === "content-security-policy");
  expect(policies.length, path).toBe(1);
  return policies[0]!.value;
};

test("book and checkout list Google's hosts in their nonce policy", async ({ request }) => {
  for (const path of [
    "/dat-tour/du-thuyen-vinh-ha-long",
    "/en/book/ha-long-bay-cruise",
    "/thanh-toan/PTA-2611-9999",
    "/en/checkout/PTA-2611-9999/payment",
    "/thanh-toan/PTA-2611-9999/ket-qua",
  ]) {
    const policy = await policyOf(request, path);
    expect(policy, path).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic' https:\/\/\*\.googletagmanager\.com/);
    expect(policy, path).toContain("https://*.google-analytics.com");
  }
});

test("the payment link, lookup, sign-in and account pages allow no request to Google", async ({ request }) => {
  for (const path of [
    `/thanh-toan/link/${"t".repeat(43)}`,
    `/en/pay/${"t".repeat(43)}`,
    "/tra-cuu-booking",
    "/en/booking-lookup",
    "/dang-nhap",
    "/en/register",
    "/en/forgot-password",
    "/tai-khoan",
    "/en/account/bookings",
  ]) {
    const policy = await policyOf(request, path);
    expect(policy, path).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(policy, path).not.toMatch(GOOGLE);
  }
});
