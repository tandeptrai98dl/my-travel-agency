import { expect, type Locator, type Page, test } from "@playwright/test";

import { adminApi } from "./support/admin-api";
import { signInAs } from "./support/auth";

// Phase 2 acceptance (DEVELOPMENT_PLAN.md): "an editor publishes a full VI/EN tour without a
// developer". The editor uploads and describes the photo, creates the draft, fills both
// languages, the hero, the gallery and the itinerary, and publishes. The tour's first departure
// needs an admin by design (ADR-024); the test sets it up through the service role, standing in
// for the admin's departures step, which departures.spec.ts and admin.spec.ts cover.

const run = Date.now().toString(36).slice(-5);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const altVi = `Ruộng bậc thang mùa lúa chín ${run}`;
const altEn = `Rice terraces at harvest time ${run}`;
const titleVi = `Mùa vàng Mù Cang Chải ${run}`;
const titleEn = `Golden season in Mu Cang Chai ${run}`;

/** Opens the media picker from `trigger` and picks the test photo. */
async function pickPhoto(page: Page, trigger: Locator, confirm: string) {
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "Chọn ảnh" });
  await picker.getByRole("searchbox", { name: "Tìm theo mô tả hoặc tên tệp" }).fill(run);
  await picker.getByRole("searchbox", { name: "Tìm theo mô tả hoặc tên tệp" }).press("Enter");
  await picker.getByRole("button", { name: altVi, exact: true }).click();
  await picker.getByRole("button", { name: confirm, exact: true }).click();
  await expect(picker).toBeHidden();
}

async function fillLanguage(page: Page, panel: Locator, language: "vi" | "en") {
  const vi = language === "vi";
  await panel.getByLabel("Tóm tắt", { exact: true }).fill(
    vi ? "Ba ngày giữa những thửa ruộng bậc thang vào mùa gặt." : "Three days among the terraces at harvest time.",
  );
  await panel.getByLabel("Mô tả SEO").fill(
    vi ? "Hành trình ba ngày ngắm mùa lúa chín ở Mù Cang Chải." : "A three-day journey to the rice harvest in Mu Cang Chai.",
  );
  await panel.getByRole("button", { name: "Thêm ngày" }).click();
  await panel.getByLabel("Tiêu đề ngày 1").fill(vi ? "Hà Nội – Mù Cang Chải" : "Hanoi to Mu Cang Chai");
  await pickPhoto(page, panel.getByRole("group", { name: "Ảnh của ngày" }).getByRole("button", { name: "Chọn ảnh" }), "Chọn");
  await panel.getByRole("switch", { name: vi ? "Xuất bản bản tiếng Việt" : "Xuất bản bản tiếng Anh" }).click();
}

test("an editor publishes a full VI/EN tour without a developer", async ({ page }) => {
  test.skip(!process.env.SEED_USER_PASSWORD, "needs the seeded staff accounts (CI)");
  test.setTimeout(120_000);
  await signInAs(page, "editor");

  // The photo, uploaded and described in both languages.
  await page.goto("/admin/media");
  await expect(page.getByRole("heading", { level: 1, name: "Thư viện ảnh" })).toBeVisible();
  // The uploader's change handler exists only once the page has hydrated.
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').setInputFiles({ name: `mu-cang-chai-${run}.png`, mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("region", { name: "Tiến trình tải lên" }).getByText(`Đã tải mu-cang-chai-${run}.png`)).toBeVisible({
    timeout: 20_000,
  });
  const search = page.getByRole("searchbox", { name: "Tìm theo mô tả hoặc tên tệp" });
  await search.fill(`mu-cang-chai-${run}`);
  await page.getByRole("button", { name: "Lọc" }).click();
  await page.getByRole("button", { name: /^Sửa ảnh:/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Thông tin ảnh" });
  await dialog.getByLabel("Mô tả ảnh (tiếng Việt)").fill(altVi);
  await dialog.getByLabel("Mô tả ảnh (tiếng Anh)").fill(altEn);
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(dialog).toBeHidden();

  // A draft from the short form.
  await page.goto("/admin/tours/new");
  await page.getByLabel("Tên tour (tiếng Việt)").fill(titleVi);
  await page.getByLabel("Mã tour").fill(`PUB-${run.toUpperCase()}`);
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();
  await expect(page).toHaveURL(/\/admin\/tours\/[0-9a-f-]{36}$/);
  const tourId = page.url().split("/").pop()!;

  // The admin's step: the first departure (ADR-024).
  const start = new Date(Date.now() + 60 * 86_400_000);
  const day = (offset: number) => new Date(start.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  const departure = await adminApi()
    .from("departures")
    .insert({ tour_id: tourId, start_date: day(0), end_date: day(2), capacity: 12, price_adult: 12_500_000 });
  if (departure.error) throw departure.error;
  await page.reload();

  // Where and what kind of trip.
  await page.getByLabel("Việt Nam › Miền Bắc", { exact: true }).check();
  await page.getByLabel("Nghỉ dưỡng", { exact: true }).check();

  // Hero and gallery.
  await pickPhoto(page, page.getByRole("group", { name: "Ảnh đại diện" }).getByRole("button", { name: "Chọn ảnh" }), "Chọn");
  await pickPhoto(page, page.getByRole("button", { name: "Thêm ảnh", exact: true }), "Chọn 1 ảnh");

  // Vietnamese, then English.
  const vi = page.getByRole("tabpanel", { name: /^Tiếng Việt/ });
  const slugVi = await vi.getByLabel("Đường dẫn (slug)").inputValue();
  await fillLanguage(page, vi, "vi");
  await page.getByRole("tab", { name: /^Tiếng Anh/ }).click();
  const en = page.getByRole("tabpanel", { name: /^Tiếng Anh/ });
  await en.getByLabel("Tên tour", { exact: true }).fill(titleEn);
  await en.getByRole("button", { name: "Tạo từ tiêu đề" }).click();
  const slugEn = await en.getByLabel("Đường dẫn (slug)").inputValue();
  expect(slugEn).toMatch(/^golden-season-in-mu-cang-chai-/);
  await fillLanguage(page, en, "en");

  // Publish.
  await page.getByRole("combobox", { name: "Trạng thái" }).click();
  await page.getByRole("option", { name: "Đã xuất bản" }).click();
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByRole("region", { name: /^Thông báo/ }).getByText("Đã lưu")).toBeVisible();
  await page.reload();
  const header = page.getByRole("region", { name: titleVi, exact: true });
  await expect(header.getByText("Đã xuất bản", { exact: true })).toBeVisible();

  // The public tour page, in both languages.
  await page.goto(`/tours/${slugVi}`);
  await expect(page.getByRole("heading", { level: 1, name: titleVi })).toBeVisible();
  await page.goto(`/en/tours/${slugEn}`);
  await expect(page.getByRole("heading", { level: 1, name: titleEn })).toBeVisible();

  await expect.poll(async () => (await page.request.get("/sitemaps/tours.xml")).text(), { timeout: 15_000 }).toContain(`/en/tours/${slugEn}</loc>`);

  // Unpublishing the English version: after the save the cached page renders again and answers a
  // real 404 (the first request may still get the noindex shell while it re-renders; Phase 3
  // spec step 22).
  await page.goto(`/admin/tours/${tourId}`);
  await page.getByRole("tab", { name: /^Tiếng Anh/ }).click();
  await page.getByRole("tabpanel", { name: /^Tiếng Anh/ }).getByRole("switch", { name: "Xuất bản bản tiếng Anh" }).click();
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByRole("region", { name: /^Thông báo/ }).getByText("Đã lưu")).toBeVisible();
  await expect.poll(async () => (await page.request.get(`/en/tours/${slugEn}`, { maxRedirects: 0 })).status(), { timeout: 15_000 }).toBe(404);
  await expect((await page.request.get(`/tours/${slugVi}`, { maxRedirects: 0 })).status()).toBe(200);
  // ...and leaves the sitemap, while the Vietnamese page stays (step 19).
  await expect.poll(async () => (await page.request.get("/sitemaps/tours.xml")).text(), { timeout: 15_000 }).not.toContain(`/en/tours/${slugEn}</loc>`);
  expect(await (await page.request.get("/sitemaps/tours.xml")).text()).toContain(`/tours/${slugVi}</loc>`);
});
