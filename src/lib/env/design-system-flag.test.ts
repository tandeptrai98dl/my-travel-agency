import { describe, expect, it } from "vitest";

import { parseEnv, serverEnvSchema } from "./schema";
import { isDesignSystemEnabled } from "./design-system-flag";

const base = { SUPABASE_SECRET_KEY: "sb_secret_test" };
const flag = (value: string | undefined) =>
  parseEnv("server", serverEnvSchema, { ...base, SHOW_DESIGN_SYSTEM: value }).SHOW_DESIGN_SYSTEM;

describe("design system page flag", () => {
  it("is off in production unless SHOW_DESIGN_SYSTEM is exactly true", () => {
    expect(isDesignSystemEnabled("production", flag(undefined))).toBe(false);
    expect(isDesignSystemEnabled("production", flag(""))).toBe(false);
    expect(isDesignSystemEnabled("production", flag("false"))).toBe(false);
    expect(isDesignSystemEnabled("production", flag("true"))).toBe(true);
    expect(() => flag("yes")).toThrow();
  });

  it("is always on in development and tests", () => {
    expect(isDesignSystemEnabled("development", false)).toBe(true);
    expect(isDesignSystemEnabled("test", false)).toBe(true);
  });
});
