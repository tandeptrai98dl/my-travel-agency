import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("zod-config", () => {
  it("is imported by every client component that parses with Zod", () => {
    const missing = files("src").filter((path) => {
      const source = readFileSync(path, "utf8");
      if (!/^["']use client["'];/m.test(source)) return false;
      const parsesWithZod = /from "zod"|zodResolver|from "@\/modules\/[^"]+\.schemas"/.test(source.replace(/^import type .*$/gm, ""));
      return parsesWithZod && !source.includes('import "@/lib/zod-config";');
    });
    expect(missing).toEqual([]);
  });
});
