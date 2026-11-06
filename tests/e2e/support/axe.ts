import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// No serious or critical axe violations against WCAG 2.2 AA (Phase 1 step 14; every admin page
// from Phase 2 on).
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Radix NavigationMenu inserts an aria-hidden, focusable sentinel after an open trigger. It never
// keeps focus: on Tab it moves focus into the menu content (or past it). axe reports it as
// aria-hidden-focus; it is excluded here by its exact shape and recorded in PROGRESS.md.
const RADIX_FOCUS_PROXY = 'li > button[aria-expanded="true"] + span[aria-hidden="true"][tabindex="0"]';

/**
 * `within` scopes the check to an open overlay: Radix marks everything outside a modal
 * aria-hidden while focus is trapped inside, which axe reports as aria-hidden-focus on the page
 * behind it. The page itself is checked separately with the overlay closed.
 */
export async function expectNoSeriousViolations(page: Page, label: string, within?: string) {
  // Colour contrast is meaningless mid-fade: let open/close animations finish first.
  // (Looping animations such as the spinner never finish and are ignored.)
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
  let builder = new AxeBuilder({ page }).withTags(TAGS).exclude(RADIX_FOCUS_PROXY);
  if (within) builder = builder.include(within);
  const results = await builder.analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, `${label}: ${summary.join("\n")}`).toEqual([]);
}
