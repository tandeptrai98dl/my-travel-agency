#!/usr/bin/env node
/**
 * Initial JavaScript budget on public pages (ARCHITECTURE.md "Performance": < 150 KB gzip;
 * docs/specs/phase-3-public-site.md decision 16). Reads the prerendered HTML of a production
 * build, adds up the gzip size of the scripts a modern browser loads at start (script tags and
 * script preloads, no `noModule` polyfills) and reports them. A warning until Phase 3 PR M;
 * `--enforce` makes an over-budget page fail.
 *
 * Usage: node scripts/check-js-budget.mjs [--enforce] [page.html ...]
 * Pages are paths under .next/server/app; by default the home page and the first tour page.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 150;
const APP = ".next/server/app";
const args = process.argv.slice(2);
const enforce = args.includes("--enforce");
let pages = args.filter((arg) => !arg.startsWith("--"));

if (pages.length === 0) {
  // Home, the tour listing, site search and one tour page (Phase 3 PR L adds the listing and search).
  pages = ["vi.html", join("vi", "tours.html"), join("vi", "search.html")];
  const tours = join(APP, "vi", "tours");
  const first = existsSync(tours) ? readdirSync(tours).find((file) => file.endsWith(".html") && !file.includes("[")) : undefined;
  if (first) pages.push(join("vi", "tours", first));
}

function initialScripts(html) {
  const sources = new Set();
  for (const match of html.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = match[1];
    if (/\bnoModule\b/i.test(attrs)) continue;
    const src = /\bsrc="\/_next\/(static\/[^"]+\.js)"/.exec(attrs);
    if (src) sources.add(src[1]);
  }
  for (const match of html.matchAll(/<link\b([^>]*)>/g)) {
    const attrs = match[1];
    if (!/\bas="script"/.test(attrs)) continue;
    const href = /\bhref="\/_next\/(static\/[^"]+\.js)"/.exec(attrs);
    if (href) sources.add(href[1]);
  }
  return [...sources];
}

let over = false;
for (const page of pages) {
  const file = join(APP, page);
  if (!existsSync(file)) {
    console.log(`::warning::JS budget: ${page} was not prerendered; skipped`);
    continue;
  }
  const html = readFileSync(file, "utf8");
  let total = 0;
  for (const source of initialScripts(html)) {
    const path = join(".next", decodeURIComponent(source));
    if (existsSync(path)) total += gzipSync(readFileSync(path), { level: 9 }).length;
  }
  const kb = Math.round((total / 1024) * 10) / 10;
  const ok = kb <= BUDGET_KB;
  over ||= !ok;
  const message = `JS budget: ${page} loads ${kb} KB gzip of JavaScript at start (budget ${BUDGET_KB} KB)`;
  console.log(ok ? message : `::${enforce ? "error" : "warning"}::${message}`);
}
process.exit(enforce && over ? 1 : 0);
