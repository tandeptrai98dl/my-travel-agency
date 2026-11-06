import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@/lib/auth/permissions";

import { ADMIN_NAV, isActive } from "./nav-items";

describe("admin navigation", () => {
  it("marks the current section, and /admin only on the overview", () => {
    expect(isActive("/admin", "/admin")).toBe(true);
    expect(isActive("/admin", "/admin/tours")).toBe(false);
    expect(isActive("/admin/tours", "/admin/tours/123")).toBe(true);
    expect(isActive("/admin/tours", "/admin/tours-archive")).toBe(false);
  });

  it("uses only permissions from the matrix and unique links", () => {
    const items = ADMIN_NAV.flatMap((group) => group.items);
    for (const item of items) expect(PERMISSIONS).toHaveProperty(item.permission);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
  });
});
