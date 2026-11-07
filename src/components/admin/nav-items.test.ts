import { describe, expect, it } from "vitest";

import { can, PERMISSIONS } from "@/lib/auth/permissions";

import bookings from "../../../messages/vi/admin-bookings.json";
import inquiries from "../../../messages/vi/admin-inquiries.json";
import vi from "../../../messages/vi/admin-settings.json";

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

  it("has a dashboard description for every section, and shows settings and staff to admins only", () => {
    const items = ADMIN_NAV.flatMap((group) => group.items).filter((item) => item.href !== "/admin");
    const links = { ...vi.Admin.Dashboard.links, ...bookings.Admin.Dashboard.links, ...inquiries.Admin.Dashboard.links } as Record<string, string>;
    for (const item of items) expect(links[item.labelKey]).toBeTruthy();
    const admin = items.filter((item) => can("admin", item.permission)).map((item) => item.href);
    const editor = items.filter((item) => can("editor", item.permission)).map((item) => item.href);
    expect(admin).toEqual(expect.arrayContaining(["/admin/settings", "/admin/staff"]));
    expect(editor).not.toContain("/admin/settings");
    expect(editor).not.toContain("/admin/staff");
    // Bookings and payments are for the booking roles, never for editors.
    expect(editor).not.toContain("/admin/bookings");
    expect(editor).not.toContain("/admin/payments");
    // The inbox: sales roles, operator (read) and admin; never accountants or editors (ADR-037).
    expect(editor).not.toContain("/admin/inquiries");
    expect(items.filter((item) => can("accountant", item.permission)).map((item) => item.href)).not.toContain("/admin/inquiries");
    expect(items.filter((item) => can("operator", item.permission)).map((item) => item.href)).toContain("/admin/inquiries");
    expect(items.filter((item) => can("accountant", item.permission)).map((item) => item.href)).toEqual(
      expect.arrayContaining(["/admin/bookings", "/admin/payments"]),
    );
  });
});
