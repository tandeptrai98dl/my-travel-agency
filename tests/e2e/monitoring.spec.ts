import { expect, test } from "@playwright/test";

// CI builds with a fake public DSN (NEXT_PUBLIC_SENTRY_DSN); requests to it are intercepted here
// and never leave the runner. Skipped when no DSN was built in.
const dsnBuiltIn = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

test("browser errors reach Sentry, without personal data", async ({ page }) => {
  test.skip(!dsnBuiltIn, "built without NEXT_PUBLIC_SENTRY_DSN");

  const envelopes: string[] = [];
  await page.route("**/api/*/envelope/**", async (route) => {
    envelopes.push(route.request().postData() ?? "");
    await route.fulfill({ status: 200, body: "{}" });
  });

  await page.goto("/en?utm_source=newsletter&email=someone%40example.test");
  await page.getByRole("link", { name: "Tiếng Việt" }).click();
  await expect(page).toHaveURL(/\/$/);

  // The SDK loads lazily after the page is idle: keep raising probe errors until one arrives.
  await expect
    .poll(
      async () => {
        await page.evaluate(() => {
          setTimeout(() => {
            throw new Error("e2e-sentry-probe");
          });
        });
        return envelopes.some((envelope) => envelope.includes("e2e-sentry-probe"));
      },
      { timeout: 20_000, intervals: [1_000] },
    )
    .toBe(true);

  const sent = envelopes.join("\n");
  expect(sent).not.toContain("someone");
  expect(sent).not.toContain("utm_source");
  expect(sent).not.toMatch(/"ip_address"/);
  // The SDK tells Sentry not to infer the visitor's IP address.
  expect(sent).toContain('"infer_ip":"never"');
});
