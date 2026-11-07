#!/usr/bin/env node
/**
 * Dependency audit (docs/specs/phase-6-hardening-launch.md decision 1, "Dependencies"): runs
 * `npm audit --omit=dev` (what is deployed) and fails on any high or critical advisory that is not
 * accepted in scripts/audit-accepted.json. An acceptance names the advisory (GHSA id), the reason
 * and an expiry date; an expired one fails again, so it is reviewed rather than forgotten. Lower
 * severities are printed and listed in docs/SECURITY_REVIEW.md "Dependencies".
 *
 * Usage: node scripts/check-audit.mjs            (CI: the "Security scans" job)
 *        node scripts/check-audit.mjs --file x.json   (a saved `npm audit --json` report, for tests)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FAILING = new Set(["high", "critical"]);
const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");

function auditReport() {
  if (fileIndex >= 0) return JSON.parse(readFileSync(args[fileIndex + 1], "utf8"));
  try {
    return JSON.parse(execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  } catch (error) {
    // npm audit exits non-zero when it finds anything; the report is still on stdout.
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

const accepted = JSON.parse(readFileSync(new URL("./audit-accepted.json", import.meta.url), "utf8")).accepted ?? [];
const today = new Date().toISOString().slice(0, 10);
const report = auditReport();
if (report.error) {
  console.error(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
  process.exit(1);
}

/** Every advisory behind each vulnerable package (the `via` entries that are objects). */
const advisories = new Map();
for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of entry.via ?? []) {
    if (typeof via !== "object") continue;
    const id = String(via.url ?? via.source).replace(/^https:\/\/github\.com\/advisories\//, "");
    const known = advisories.get(id) ?? { id, title: via.title, severity: via.severity, packages: new Set() };
    known.packages.add(name);
    advisories.set(id, known);
  }
}

let failed = false;
for (const advisory of [...advisories.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  const acceptance = accepted.find((item) => item.id === advisory.id);
  const line = `${advisory.severity.padEnd(8)} ${advisory.id} ${advisory.title} (${[...advisory.packages].join(", ")})`;
  if (!FAILING.has(advisory.severity)) {
    console.log(`  ${line}`);
  } else if (acceptance && acceptance.until >= today) {
    console.log(`  ${line}\n           accepted until ${acceptance.until}: ${acceptance.reason}`);
  } else {
    console.error(`✗ ${line}${acceptance ? `\n           acceptance expired on ${acceptance.until}` : ""}`);
    failed = true;
  }
}
for (const item of accepted) {
  if (!advisories.has(item.id)) console.log(`  (acceptance of ${item.id} no longer needed: remove it from scripts/audit-accepted.json)`);
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(`npm audit --omit=dev: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low`);
if (failed) {
  console.error("High or critical advisories without a current acceptance. Update the dependency, or accept it in scripts/audit-accepted.json with a reason and an expiry, and record it in docs/SECURITY_REVIEW.md.");
  process.exit(1);
}
