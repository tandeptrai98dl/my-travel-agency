import { readFile } from "node:fs/promises";

import { expect, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { signInAs } from "./support/auth";
import { expectNoSeriousViolations } from "./support/axe";

// Phase 6 PR 6P step 10a: the audited subscriber export carries a fresh single-use unsubscribe link
// per subscriber (only its SHA-256 is stored); the link unsubscribes once, on the button press,
// never on a plain visit, and the withdrawal is recorded in consent_records.

const run = Date.now().toString(36).slice(-5);

test("the exported link unsubscribes once, on the button press, and records the withdrawal", async ({ page, browser, baseURL }) => {
  const email = `huy-${run}@example.test`;
  const { error } = await adminApi()
    .from("subscribers")
    .insert({ email, locale: "vi", source: "footer", confirmed_at: new Date().toISOString() });
  expect(error).toBeNull();

  // The editor's export gives the subscriber's link as a merge column.
  await signInAs(page, "editor");
  await page.goto("/admin/subscribers");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất CSV" }).click();
  const csv = await readFile(await (await download).path(), "utf8");
  expect(csv.split("\r\n")[0]).toBe('"email","locale","source","confirmed_at","created_at","unsubscribe_url"');
  const line = csv.split("\r\n").find((row) => row.startsWith(`"${email}"`));
  const link = /"(https?:\/\/[^"]+\/ban-tin\/huy\?token=[A-Za-z0-9_-]{43})"$/.exec(line ?? "")?.[1];
  expect(link, line).toBeTruthy();
  const token = new URL(link!).searchParams.get("token")!;
  // Only the hash is stored.
  const { data: stored } = await adminApi().from("newsletter_unsubscribe_tokens").select("token_hash").eq("token_hash", token);
  expect(stored).toEqual([]);

  const subscriber = async () => {
    const { data } = await adminApi().from("subscribers").select("unsubscribed_at").eq("email", email).single();
    return data?.unsubscribed_at ?? null;
  };
  const withdrawals = async () => {
    const { data } = await adminApi().from("consent_records").select("purpose, granted, document_version").eq("subject_email", email);
    return data ?? [];
  };

  // A plain visit (what a mail scanner does) changes nothing.
  const context = await browser.newContext();
  const reader = await context.newPage();
  await context.addCookies([{ name: "consent", value: "v1.a0.m0", url: baseURL! }]);
  const path = new URL(link!).pathname + new URL(link!).search;
  const response = await reader.goto(path);
  expect(response?.status()).toBe(200);
  await expect(reader.getByRole("heading", { level: 1, name: "Hủy nhận bản tin" })).toBeVisible();
  expect(await reader.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
  await expectNoSeriousViolations(reader, "/ban-tin/huy");
  expect(await subscriber()).toBeNull();
  expect(await withdrawals()).toEqual([]);

  // The button unsubscribes and records the withdrawal.
  await reader.getByRole("button", { name: "Hủy nhận bản tin" }).click();
  await expect(reader.getByTestId("newsletter-unsubscribe")).toHaveAttribute("data-status", "unsubscribed");
  await expect(reader.getByRole("heading", { level: 1, name: "Bạn đã hủy nhận bản tin" })).toBeVisible();
  expect(await subscriber()).not.toBeNull();
  expect(await withdrawals()).toEqual([{ purpose: "marketing", granted: false, document_version: "newsletter-unsubscribe" }]);

  // The link works once: pressing again from a fresh visit changes nothing more.
  await reader.goto(path);
  await reader.getByRole("button", { name: "Hủy nhận bản tin" }).click();
  await expect(reader.getByTestId("newsletter-unsubscribe")).toHaveAttribute("data-status", "invalid");
  expect(await withdrawals()).toHaveLength(1);

  // A made-up or missing token offers no button.
  await reader.goto(`/en/newsletter/unsubscribe?token=${"x".repeat(43)}`);
  await reader.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(reader.getByTestId("newsletter-unsubscribe")).toHaveAttribute("data-status", "invalid");
  await reader.goto("/en/newsletter/unsubscribe");
  await expect(reader.getByRole("button", { name: "Unsubscribe" })).toHaveCount(0);
  await context.close();
});
