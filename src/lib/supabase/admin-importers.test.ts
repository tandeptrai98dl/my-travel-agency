import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The service-role client bypasses RLS, so it may be imported only from server files under
 * `src/modules/**` (ARCHITECTURE.md "Dependency rules", docs/specs/phase-6-hardening-launch.md
 * decision 1). This walks the source tree and fails on any other importer, on a client file and on
 * a module that re-exports the client. Each allowed call site is listed with its reason in
 * docs/SECURITY_REVIEW.md "Service-role use".
 */

const SRC = join(process.cwd(), "src");
// The client itself, and this test (its import examples below are strings).
const SKIP = new Set(["lib/supabase/admin.ts", "lib/supabase/admin-importers.test.ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

/** Module specifiers that resolve to src/lib/supabase/admin(.ts). */
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']*supabase\/admin(?:\.ts)?)["']/g;

function adminImports(code: string): string[] {
  return [...code.matchAll(IMPORT)].map((match) => match[1]);
}

const files = sourceFiles(SRC).map((path) => ({ rel: relative(SRC, path).split(sep).join("/"), code: readFileSync(path, "utf8") }));
const importers = files.filter((file) => !SKIP.has(file.rel) && adminImports(file.code).length > 0);

describe("service-role client importers", () => {
  it("finds the importers (vacuity guard)", () => {
    expect(importers.length).toBeGreaterThan(15);
  });

  it("are all under src/modules/**", () => {
    expect(importers.map((file) => file.rel).filter((rel) => !rel.startsWith("modules/"))).toEqual([]);
  });

  it("are server files: `server-only` (or a unit test that mocks the client), never `use client`", () => {
    const offenders = importers
      .filter((file) => {
        if (/^\s*["']use client["']/m.test(file.code)) return true;
        if (/\.test\.tsx?$/.test(file.rel)) return false;
        return !/^import ["']server-only["'];?$/m.test(file.code);
      })
      .map((file) => file.rel);
    expect(offenders).toEqual([]);
  });

  it("never re-export the client to other layers", () => {
    const reexports = files
      .filter((file) => !SKIP.has(file.rel))
      .filter((file) => /export\s*(?:\*|\{[^}]*\})\s*from\s*["'][^"']*supabase\/admin/.test(file.code))
      .map((file) => file.rel);
    expect(reexports).toEqual([]);
  });

  it("detects every import form the walk relies on", () => {
    expect(adminImports('import { createAdminClient } from "@/lib/supabase/admin";')).toHaveLength(1);
    expect(adminImports("const m = await import('../../lib/supabase/admin');")).toHaveLength(1);
    expect(adminImports('vi.mock("@/lib/supabase/admin", () => ({}));')).toHaveLength(0);
    expect(adminImports('import "@/lib/supabase/admin.ts";')).toHaveLength(1);
  });
});
