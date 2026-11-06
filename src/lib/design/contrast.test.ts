import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contrastRatio, hslChannelsToRgb, readTokens } from "./contrast";

const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
const root = readTokens(css, ":root");
const navyOverrides = readTokens(css, ".theme-navy");
const navy = { ...root, ...navyOverrides };

const TEXT = 4.5; // WCAG AA, normal text
const UI = 3; // WCAG AA, UI components, focus indicators and large text

/** [foreground token, background token, minimum ratio] */
const PAIRS: [string, string, number][] = [
  ["foreground", "background", TEXT],
  ["card-foreground", "card", TEXT],
  ["popover-foreground", "popover", TEXT],
  ["primary-foreground", "primary", TEXT],
  ["secondary-foreground", "secondary", TEXT],
  ["muted-foreground", "background", TEXT],
  ["muted-foreground", "card", TEXT],
  ["muted-foreground", "muted", TEXT],
  ["accent-foreground", "accent", TEXT],
  ["destructive-foreground", "destructive", TEXT],
  ["destructive", "background", TEXT],
  ["destructive", "card", TEXT],
  ["ring", "background", UI],
  ["ring", "card", UI],
  ["input", "card", UI],
  ["input", "background", UI],
];

/** Status colours as text and as badge backgrounds, in both themes. */
const STATUS_PAIRS: [string, string, number][] = [
  ["success-foreground", "success", TEXT],
  ["warning-foreground", "warning", TEXT],
  ["success", "background", TEXT],
  ["success", "card", TEXT],
  ["warning", "background", TEXT],
  ["warning", "card", TEXT],
];

function ratio(tokens: Record<string, string>, fg: string, bg: string): number {
  const a = tokens[fg];
  const b = tokens[bg];
  if (!a || !b) throw new Error(`missing token ${a ? bg : fg}`);
  return contrastRatio(hslChannelsToRgb(a), hslChannelsToRgb(b));
}

describe("design tokens meet WCAG AA (ADR-021)", () => {
  it.each([...PAIRS, ...STATUS_PAIRS])("light: %s on %s >= %s", (fg, bg, min) => {
    expect(ratio(root, fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it.each([...PAIRS, ...STATUS_PAIRS])("navy section: %s on %s >= %s", (fg, bg, min) => {
    expect(ratio(navy, fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("really re-maps the navy section (the test cannot pass on :root values alone)", () => {
    expect(Object.keys(navyOverrides).length).toBeGreaterThanOrEqual(15);
    expect(navyOverrides.background).not.toBe(root.background);
    expect(navyOverrides.foreground).not.toBe(root.foreground);
  });

  it("uses solid focus colours (no translucent rings whose real contrast is untested)", () => {
    const sources = ["input", "button", "checkbox", "dropdown-menu"].map((name) =>
      readFileSync(fileURLToPath(new URL(`../../components/ui/${name}.tsx`, import.meta.url)), "utf8"),
    );
    for (const source of sources) {
      expect(source).not.toMatch(/ring-ring\/\d|ring-destructive\/\d|focus:bg-accent/);
    }
  });

  it("keeps gold decorative on light surfaces (it fails AA as text there)", () => {
    expect(ratio(root, "gold", "background")).toBeLessThan(TEXT);
    expect(ratio(navy, "gold", "background")).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("contrast helpers", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio([0, 0, 0], [1, 1, 1])).toBeCloseTo(21, 5);
    expect(contrastRatio(hslChannelsToRgb("0 0% 100%"), hslChannelsToRgb("0 0% 100%"))).toBe(1);
  });
});
