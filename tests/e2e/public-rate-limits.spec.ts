import { spawnSync } from "node:child_process";

import { expect, test } from "./support/test";

// Rate-limit fail modes of the public forms (Phase 6 spec decision 1; ADR-029, ADR-039). The
// over-limit answers and the fail-closed refusals of every form are proved in
// src/lib/rate-limit.public-forms.test.ts with the real rate limiter; this spec checks the one fail
// mode a browser sees on a real build: CI has no Upstash, so the cookie-consent record is refused
// (fail closed), and the visitor's choice still applies at once while no row is written.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function psql(sql: string): string {
  const result = spawnSync("psql", [process.env.E2E_DB_URL!, "-qXtA", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`);
  return result.stdout.trim();
}

test("without Upstash the consent record fails closed: the choice applies, no row is written", async ({ page, google }) => {
  test.skip(!process.env.E2E_DB_URL, "needs the local database URL (CI)");
  test.skip(Boolean(process.env.UPSTASH_REDIS_REST_URL), "only meaningful where Upstash is not configured");
  await page.goto("/en");
  const recorded = page.waitForResponse((response) => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));
  await page.getByRole("region", { name: "Cookies on this website" }).getByRole("button", { name: "Accept all" }).click();
  await recorded;

  // The choice applies: the cookie holds it with its pseudonymous record id, the banner is gone,
  // and (with a measurement ID) gtag.js loads.
  const consent = (await page.context().cookies()).find((cookie) => cookie.name === "consent");
  expect(consent?.value).toMatch(/^v1\.a1\.m1\./);
  const id = consent!.value.split(".")[3]!;
  expect(id).toMatch(UUID);
  await expect(page.getByRole("region", { name: "Cookies on this website" })).toBeHidden();
  if (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) {
    await expect.poll(() => google.requests.some((url) => url.startsWith("https://www.googletagmanager.com/gtag/js"))).toBe(true);
  }

  // The proof waits for its one retry, which is refused as well; neither writes a row.
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("consent-retry"))).not.toBeNull();
  const retried = page.waitForResponse((response) => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));
  await page.goto("/en/tours");
  await retried;
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("consent-retry"))).toBeNull();
  expect(psql(`select count(*) from public.cookie_consents where id = '${id}'`)).toBe("0");
});
