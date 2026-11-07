import { expect, type Locator, type Page, test } from "./support/test";

import { seedPassword } from "./support/auth";
import { closeTestDepartures, testDeparture } from "./support/booking";

// Phase 6 keyboard pass (docs/specs/phase-6-hardening-launch.md decision 5, docs/QA_REPORT.md):
// keyboard only, no mouse. The menus, the cookie banner and its dialog, the filter sheet and the
// mobile menu already have keyboard tests (shell.spec.ts, a11y.spec.ts, tour-listing.spec.ts);
// this file adds a Tab walk over the main public pages, customer sign-in and the booking form. The
// tour gallery's lightbox is checked locally only (QA_REPORT.md): the seed has no gallery photos
// and the tour page is cached, so a test cannot add some. Screen-reader passes need people.

test.afterAll(closeTestDepartures);

async function dismissConsent(page: Page) {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("baseURL is not configured");
  await page.context().addCookies([{ name: "consent", value: "v1.a0.m0", url }]);
}

/** Presses Tab until one of `target`'s elements has focus (at most `max` times); fails if none does. */
async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluateAll((elements) => (elements as Element[]).includes(document.activeElement as Element))) return;
  }
  throw new Error(`Tab never reached ${target}`);
}

type Stop = { key: string; label: string; ring: boolean; covered: string | null; footer: boolean };

/** The focused element: a stable key, whether it shows a focus indicator and what covers it. */
function readStop(): Stop | null {
  const element = document.activeElement as HTMLElement | null;
  if (!element || element === document.body) return null;
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  const shows = (css: CSSStyleDeclaration) =>
    (css.outlineStyle !== "none" && parseFloat(css.outlineWidth) > 0) || (css.boxShadow !== "" && css.boxShadow !== "none");
  // Radio and checkbox cards draw the ring on their label (`has-[:focus-visible]:ring-2`).
  const card = element.closest("label");
  const ring = shows(style) || (card !== null && shows(getComputedStyle(card)));
  const x = Math.min(innerWidth - 1, Math.max(0, box.left + box.width / 2));
  const y = Math.min(innerHeight - 1, Math.max(0, box.top + box.height / 2));
  const top = document.elementFromPoint(x, y);
  const covered = top && top !== element && !element.contains(top) && !top.contains(element) ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 40)}` : null;
  const label = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  return { key: `${element.tagName}|${label}|${Math.round(box.top + scrollY)}|${Math.round(box.left)}`, label, ring, covered, footer: !!element.closest("footer") };
}

const WALK_PAGES = [
  "/",
  "/tours",
  "/tours/du-thuyen-vinh-ha-long",
  "/diem-den/viet-nam",
  "/journal/mot-ngay-tren-vinh-lan-ha",
  "/thiet-ke-rieng",
  "/lien-he",
  "/en/contact",
];

for (const width of [1280, 1024]) {
  test(`Tab reaches the footer on the main public pages with a visible, uncovered focus at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await dismissConsent(page);
    for (const path of WALK_PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const stops: Stop[] = [];
      for (let i = 0; i < 200; i += 1) {
        await page.keyboard.press("Tab");
        const stop = await page.evaluate(readStop);
        if (!stop) {
          if (stops.length > 0) break; // left the document after the last stop
          continue;
        }
        if (stop.key === stops[0]?.key) break; // wrapped around
        stops.push(stop);
      }
      expect(stops.length, `${path}: focusable elements`).toBeGreaterThan(5);
      expect(stops.filter((stop) => !stop.ring).map((stop) => stop.label), `${path}: stops without a focus indicator`).toEqual([]);
      expect(stops.filter((stop) => stop.covered).map((stop) => `${stop.label} under ${stop.covered}`), `${path}: covered stops`).toEqual([]);
      // No trap: the walk gets through the page to the footer.
      expect(stops.some((stop) => stop.footer), `${path}: Tab reaches the footer`).toBe(true);
    }
  });
}

test("a customer signs in with the keyboard only", async ({ page }) => {
  await dismissConsent(page);
  await page.goto("/dang-nhap");
  const form = page.getByTestId("login-form");
  const email = form.getByLabel("Email");
  await tabTo(page, email);
  await page.keyboard.type("customer@example.test");
  await page.keyboard.press("Tab");
  await expect(form.getByLabel("Mật khẩu", { exact: true })).toBeFocused();
  await page.keyboard.type(seedPassword());
  await page.keyboard.press("Tab");
  await expect(form.getByRole("button", { name: "Đăng nhập" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/tai-khoan$/);
});

test("the booking form works with the keyboard only, up to the payment page", async ({ page }) => {
  test.setTimeout(90_000);
  await dismissConsent(page);
  const departure = await testDeparture(4);
  await page.goto(`/dat-tour/du-thuyen-vinh-ha-long?departure=${departure.departureId}&adults=1`);
  await expect(page.getByTestId("booking-total")).toHaveText(/12\.900\.000/);

  // Step 1: the steppers are buttons.
  await tabTo(page, page.getByRole("button", { name: "Tăng Người lớn" }));
  await page.keyboard.press("Space");
  await expect(page.getByTestId("booking-total")).toHaveText(/25\.800\.000/);
  await tabTo(page, page.getByRole("button", { name: "Tiếp tục", exact: true }));
  await page.keyboard.press("Enter");

  // Step 2: focus moves to the step's heading; the fields follow in order.
  await expect(page.getByRole("main").getByRole("heading", { level: 2, name: "Liên hệ" })).toBeFocused();
  await tabTo(page, page.getByLabel("Họ và tên"));
  await page.keyboard.type("Lê Bàn Phím");
  await tabTo(page, page.getByLabel("Email"));
  await page.keyboard.type(`keyboard-${Date.now()}@example.test`);
  await tabTo(page, page.getByLabel("Số điện thoại"));
  await page.keyboard.type("+84 912 000 222");
  await tabTo(page, page.getByRole("button", { name: "Tiếp tục", exact: true }));
  await page.keyboard.press("Enter");

  // Step 3: plan and terms with Space, submit with Enter.
  const full = page.getByLabel("Thanh toán toàn bộ");
  // Tab enters a radio group on its checked option; the arrows move the choice.
  await tabTo(page, page.locator('input[name="plan"]'));
  for (let i = 0; i < 4 && !(await full.isChecked()); i += 1) await page.keyboard.press("ArrowDown");
  await expect(full).toBeChecked();
  const terms = page.getByRole("checkbox", { name: /Tôi đồng ý với/ });
  await tabTo(page, terms);
  await page.keyboard.press("Space");
  await expect(terms).toBeChecked();
  await tabTo(page, page.getByRole("button", { name: "Tiếp tục thanh toán" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/thanh-toan\/PTA-\d{4}-\d{4,}\/phuong-thuc$/);
});
