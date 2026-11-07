import { expect, test } from "./support/test";

// Language switcher follow-ups from the #49 review: the server HTML already links the other
// language's path (no client fix-up needed), and the fallback link keeps the query string.

test("the server HTML of /lien-he links the English contact page", async ({ request }) => {
  const response = await request.get("/lien-he");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('href="/en/contact"');
  // And not the internal or a guessed path.
  expect(html).not.toContain('href="/en/lien-he"');
  expect(html).not.toContain('href="/en/vi/contact"');
});

test("the fallback link keeps the query string of a filtered listing", async ({ page }) => {
  await page.goto("/en/tours?scope=international");
  const vietnamese = page.getByRole("banner").getByRole("navigation", { name: "Language" }).getByRole("link", { name: "Tiếng Việt" });
  await vietnamese.focus();
  await expect(vietnamese).toHaveAttribute("href", "/tours?scope=international");
  await vietnamese.click();
  await expect(page).toHaveURL(/\/tours\?scope=international$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");

  // Without a query the link has none.
  await page.goto("/en/tours");
  const plain = page.getByRole("banner").getByRole("navigation", { name: "Language" }).getByRole("link", { name: "Tiếng Việt" });
  await plain.focus();
  await expect(plain).toHaveAttribute("href", "/tours");
});
