import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compareDbTypes, normaliseTypes } from "../../../scripts/compare-db-types.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const workflow = readFileSync(`${root}.github/workflows/db-migrate.yml`, "utf8");
const ciWorkflow = readFileSync(`${root}.github/workflows/ci.yml`, "utf8");
/** The workflow without its comment lines, for checks on what actually runs. */
const code = workflow
  .split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

/** The workflow's `run:` scripts, one string per step (block scalars included). */
function runBlocks(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)run:\s*(\|)?(.*)$/.exec(lines[i]);
    if (!match) continue;
    if (!match[2]) {
      blocks.push(match[3]);
      continue;
    }
    const indent = match[1].length;
    const body: string[] = [];
    for (i += 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim() !== "" && line.search(/\S/) <= indent) {
        i -= 1;
        break;
      }
      body.push(line);
    }
    blocks.push(body.join("\n"));
  }
  return blocks;
}

describe("protected migration workflow (Phase 6 decision 11, ADR-040)", () => {
  it("runs only on manual dispatch, for staging or production, from main", () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(code).not.toMatch(/^\s+(push|pull_request|pull_request_target|schedule|workflow_run):/m);
    expect(workflow).toMatch(/options:\n\s+- staging\n\s+- production\n/);
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain('git merge-base --is-ancestor "$GITHUB_SHA" origin/main');
  });

  it("uses the target's GitHub environment, read-only token and one run per target", () => {
    expect(workflow).toContain("environment: ${{ inputs.target }}");
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(workflow).toContain("group: db-migrate-${{ inputs.target }}");
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("checks out the exact commit without persisting credentials", () => {
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("persist-credentials: false");
  });

  it("pins every action to a full commit SHA", () => {
    const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThanOrEqual(3);
    for (const ref of uses) expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });

  it("checks the backup before anything is pushed, and refuses production without PITR", () => {
    const order = ["Backup check", "Dump the schema", "Dry run", "Apply the migrations", "remote schema matches"];
    const positions = order.map((name) => workflow.indexOf(name));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(workflow).toContain('[ "$TARGET" = "production" ] && [ "$pitr" != "true" ]');
  });

  it("keeps only a schema dump, for at most 7 days", () => {
    expect(code).not.toMatch(/--data-only|--use-copy/);
    expect(workflow).toMatch(/retention-days: 7\n/);
    expect([...workflow.matchAll(/retention-days:\s*(\d+)/g)].every((m) => Number(m[1]) <= 7)).toBe(true);
  });

  it("never seeds, never applies migrations out of order, and dry-runs first", () => {
    expect(code).not.toContain("--include-seed");
    expect(code).not.toContain("--include-all");
    expect(code).not.toContain("--include-roles");
    expect(workflow).toMatch(/db push --remote="\$SUPABASE_PROJECT_REF" --skip-vault --dry-run/);
    expect(workflow).toMatch(/db push --remote="\$SUPABASE_PROJECT_REF" --skip-vault --yes/);
  });

  it("never prints, traces or inlines secrets", () => {
    for (const script of runBlocks(workflow)) {
      expect(script).not.toMatch(/\$\{\{\s*secrets\./);
      expect(script).not.toMatch(/set\s+-[a-z]*x|bash\s+-x/);
      expect(script).not.toMatch(/(echo|printf)[^\n|]*\$\{?(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD)/);
    }
    // Secrets reach only step-level env blocks, never the job or workflow env.
    const jobEnv = /\n {4}env:\n((?: {6}.*\n)+)/.exec(workflow)?.[1] ?? "";
    expect(jobEnv).not.toContain("secrets.");
    expect(workflow).not.toMatch(/^env:/m);
    const secretNames = new Set([...workflow.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]));
    expect([...secretNames].sort()).toEqual(["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_REF"]);
  });

  it("installs dependencies without lifecycle scripts", () => {
    expect(workflow).toContain("npm ci --ignore-scripts");
  });

  it("leaves the CI workflow's four jobs in place", () => {
    for (const job of ["checks:", "security-scans:", "database:", "build-e2e:"]) {
      expect(ciWorkflow).toMatch(new RegExp(`^ {2}${job}`, "m"));
    }
  });
});

describe("compareDbTypes", () => {
  const committed = 'export type Database = {\n  "public": {\n    Tables: {\n      "a": { Row: { "id": string,"n": number | null } }\n    }\n  }\n}\n';

  it("accepts identical files", () => {
    expect(compareDbTypes(committed, committed).result).toBe("identical");
  });

  it("accepts the same schema laid out differently, with an __InternalSupabase block", () => {
    const remote = 'export type Database = {\n  // generated\n  __InternalSupabase: {\n    PostgrestVersion: "13.0.5"\n  }\n  public: {\n    Tables: {\n      a: {\n        Row: {\n          id: string;\n          n: number | null;\n        };\n      };\n    };\n  };\n};\n'
      .replace("// generated\n", "");
    // Quoted and bare keys differ: that is a real difference for the checker, so quote them here.
    const quoted = remote.replace(/\b(public|a|id|n):/g, '"$1":');
    expect(compareDbTypes(committed, quoted).result).toBe("equivalent");
  });

  it("refuses a missing column or a changed type, and shows where", () => {
    const changed = committed.replace("number | null", "string | null");
    const outcome = compareDbTypes(committed, changed);
    expect(outcome.result).toBe("different");
    expect(outcome.detail).toContain("number");
    expect(compareDbTypes(committed, committed.replace(',"n": number | null', "")).result).toBe("different");
  });

  it("removes nested braces of the internal block only", () => {
    expect(normaliseTypes('{ __InternalSupabase: { a: { b: 1 } }, x: 1 }')).toBe("{x:1}");
  });
});
