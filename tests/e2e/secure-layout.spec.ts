import { expect, type Page, test } from "./support/test";

// Phase 6 secure-page QA (docs/QA_REPORT.md, "Items for Stream A"): on book, checkout and sign-in
// the footer started inside the first viewport and moved down as the streamed content arrived
// (CLS up to 0.107 in Lighthouse). `<main>` in the secure root is now at least a screen tall, so
// the footer starts below the fold. The structural check (footer below the fold from the first
// paint) holds on any machine; the layout-shift check is the symptom, which an unthrottled CI run
// rarely reproduces, so it guards against regressions rather than proving the fix on its own.

type Shift = { value: number; sources: string[] };

async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const shifts: { value: number; sources: string[] }[] = [];
    (window as unknown as { __shifts: typeof shifts }).__shifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] })[]) {
        if (entry.hadRecentInput) continue;
        shifts.push({
          value: entry.value,
          sources: (entry.sources ?? []).map((source) => (source.node instanceof Element ? source.node.tagName.toLowerCase() : "#other")),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

const PAGES = ["/dang-nhap", "/en/login", "/thanh-toan/PTA-0000-0000", "/dat-tour/du-thuyen-vinh-ha-long", "/en/book/ha-long-bay-cruise"];

for (const viewport of [
  { width: 412, height: 823 },
  { width: 1280, height: 800 },
]) {
  test(`secure pages keep the footer below the fold at ${viewport.width} px`, async ({ page, baseURL }) => {
    await page.setViewportSize(viewport);
    await page.context().addCookies([{ name: "consent", value: "v1.a0.m0", url: baseURL! }]);
    await watchShifts(page);
    for (const path of PAGES) {
      await page.goto(path);
      // The footer is part of the secure root's shell, so it is in the first streamed chunk.
      const top = await page.locator("body > footer").evaluate((footer) => footer.getBoundingClientRect().top + window.scrollY);
      expect(top, `${path}: footer top`).toBeGreaterThanOrEqual(viewport.height);
      await page.waitForLoadState("networkidle");
      const shifts = await page.evaluate(() => (window as unknown as { __shifts: Shift[] }).__shifts);
      expect(shifts.filter((shift) => shift.sources.includes("footer")), `${path}: footer shifts`).toEqual([]);
      const cls = shifts.reduce((sum, shift) => sum + shift.value, 0);
      expect(cls, `${path}: layout shift`).toBeLessThan(0.1);
    }
  });
}
