#!/usr/bin/env node
/**
 * Compares the committed `src/types/database.types.ts` with types generated from a hosted project
 * (the "Database migrations" workflow, docs/specs/phase-6-hardening-launch.md decision 11).
 *
 *   node scripts/compare-db-types.mjs <committed.ts> <remote.ts>
 *
 * Exit 0 when they are identical, or identical once formatting is ignored (the hosted generator
 * may lay the file out differently from the local one CI uses, and may add an
 * `__InternalSupabase` block with its PostgREST version). Exit 1 with the first difference
 * otherwise: the hosted schema is not the one the code was built against. Prints no values from
 * the environment.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Removes the `__InternalSupabase: { ... }` member (balanced braces), whitespace, and the
 * `,`/`;` member separators, which differ between generators but carry no schema.
 * @param {string} source
 * @returns {string}
 */
export function normaliseTypes(source) {
  let text = source;
  const marker = /__InternalSupabase\s*:\s*\{/g;
  let match;
  while ((match = marker.exec(text))) {
    let depth = 0;
    let end = -1;
    for (let i = match.index + match[0].length - 1; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) break;
    text = text.slice(0, match.index) + text.slice(end);
    marker.lastIndex = match.index;
  }
  return text.replace(/\s+/g, "").replace(/[,;]/g, "");
}

/**
 * @param {string} committed
 * @param {string} remote
 * @returns {{ result: "identical" | "equivalent" | "different", detail?: string }}
 */
export function compareDbTypes(committed, remote) {
  if (committed === remote) return { result: "identical" };
  const a = normaliseTypes(committed);
  const b = normaliseTypes(remote);
  if (a === b) return { result: "equivalent" };
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const from = Math.max(0, i - 120);
  return {
    result: "different",
    detail: `first difference at normalised offset ${i}:\n  committed: …${a.slice(from, i + 120)}\n  remote:    …${b.slice(from, i + 120)}`,
  };
}

function main([committedPath, remotePath]) {
  if (!committedPath || !remotePath) {
    console.error("usage: node scripts/compare-db-types.mjs <committed.ts> <remote.ts>");
    return 2;
  }
  const remote = readFileSync(remotePath, "utf8");
  if (!/export type Database\b/.test(remote)) {
    console.error("The remote types file has no `Database` type: type generation failed.");
    return 1;
  }
  const { result, detail } = compareDbTypes(readFileSync(committedPath, "utf8"), remote);
  if (result === "identical") {
    console.log("The remote schema gives exactly the committed types.");
    return 0;
  }
  if (result === "equivalent") {
    console.log("The remote schema matches the committed types (formatting differs only).");
    return 0;
  }
  console.error(
    "The remote schema does NOT match src/types/database.types.ts. Either a migration is missing\n" +
      "or extra on the remote (see `supabase migration list` in the log), or the schema was changed\n" +
      "outside migrations (dashboard edits). Investigate before deploying the code.\n" +
      detail,
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
