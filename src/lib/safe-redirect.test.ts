import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/admin", "/admin"],
    ["/en/tours?page=2#list", "/en/tours?page=2#list"],
    ["/auth/update-password", "/auth/update-password"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/.//evil.example",
    "/a/..//evil.example",
    "/%2e//evil.example",
    "/./\\evil.example",
    "/%2e%2e//evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "admin",
    "",
    null,
    undefined,
  ])("falls back for %s", (input) => {
    expect(safeRedirectPath(input, "/fallback")).toBe("/fallback");
  });
});
