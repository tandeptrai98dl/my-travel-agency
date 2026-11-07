import { describe, expect, it } from "vitest";

import {
  can,
  isStaffRole,
  MFA_REQUIRED_ROLES,
  PERMISSIONS,
  type Permission,
  requiresMfa,
  type Role,
} from "./permissions";

describe("permission matrix (ARCHITECTURE.md)", () => {
  it("gives admin every permission and customers none", () => {
    for (const permission of Object.keys(PERMISSIONS) as Permission[]) {
      expect(can("admin", permission), permission).toBe(true);
      expect(can("customer", permission), permission).toBe(false);
    }
  });

  it.each<[Role, Permission, boolean]>([
    ["sales", "inquiries.edit", true],
    ["operator", "inquiries.read", true],
    ["operator", "inquiries.edit", false],
    ["accountant", "inquiries.read", false],
    ["editor", "bookings.read", false],
    ["accountant", "bookings.read", true],
    ["sales", "bookings.send_payment_link", true],
    ["sales", "bookings.change_status", false],
    ["sales", "bookings.request_cancellation", true],
    ["operator", "bookings.change_status", true],
    ["operator", "bookings.edit_travellers", true],
    ["accountant", "bookings.resolve_attention", true],
    ["sales", "bookings.resolve_attention", false],
    ["editor", "bookings.resolve_attention", false],
    ["accountant", "payments.record", true],
    ["accountant", "payments.refund", true],
    ["sales", "payments.read", true],
    ["sales", "payments.record", false],
    ["editor", "tours.edit_content", true],
    ["operator", "tours.edit_content", false],
    ["operator", "departures.edit", true],
    ["sales_manager", "prices.edit", false],
    ["editor", "content.manage", true],
    ["sales", "content.manage", false],
    ["editor", "customers.read", false],
    ["sales", "customers.notes", true],
    ["sales", "customers.delete_data", false],
    ["editor", "redirects.manage", true],
    ["accountant", "settings.manage", false],
    ["editor", "staff.manage", false],
    ["sales_manager", "audit.read", false],
  ])("%s / %s -> %s", (role, permission, expected) => {
    expect(can(role, permission)).toBe(expected);
  });

  it("requires MFA for admin and accountant only", () => {
    expect([...MFA_REQUIRED_ROLES].sort()).toEqual(["accountant", "admin"]);
    expect(requiresMfa("admin")).toBe(true);
    expect(requiresMfa("accountant")).toBe(true);
    expect(requiresMfa("sales")).toBe(false);
    expect(requiresMfa(null)).toBe(false);
  });

  it("recognises staff roles", () => {
    expect(isStaffRole("editor")).toBe(true);
    expect(isStaffRole("customer")).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});
