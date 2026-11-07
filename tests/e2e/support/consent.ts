import { type Page, test } from "./test";

/**
 * Stores an "essential only" cookie choice before the page opens, so the consent banner does not
 * cover the page under test. Specs about the banner itself leave it out.
 */
export async function dismissConsent(page: Page) {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("baseURL is not configured");
  await page.context().addCookies([{ name: "consent", value: "v1.a0.m0", url }]);
}
