import type { Database } from "@/types/database.types";

/**
 * The staff permission matrix from docs/ARCHITECTURE.md ("Authorization"), as code.
 *
 * This is the first check (requireRole / can) and drives what the admin UI shows. RLS in the
 * database is the source of truth and enforces the same rules again (ADR-004, ADR-009).
 */

export type Role = Database["public"]["Enums"]["user_role"];
export type StaffRole = Exclude<Role, "customer">;

export const STAFF_ROLES = [
  "sales",
  "sales_manager",
  "operator",
  "accountant",
  "editor",
  "admin",
] as const satisfies readonly StaffRole[];

/** Roles that must pass TOTP MFA (session `aal2`) before any staff action (ADR-009). */
export const MFA_REQUIRED_ROLES = ["admin", "accountant"] as const satisfies readonly StaffRole[];

const SALES = ["sales", "sales_manager"] as const;

export const PERMISSIONS = {
  "dashboard.view": STAFF_ROLES,

  "inquiries.read": [...SALES, "operator", "admin"],
  "inquiries.edit": [...SALES, "admin"],
  // ADR-037: sales managers and admins see every inquiry and assign anyone (sales take unassigned ones).
  "inquiries.manage_all": ["sales_manager", "admin"],

  "bookings.read": [...SALES, "operator", "accountant", "admin"],
  "bookings.edit": [...SALES, "admin"],
  "bookings.send_payment_link": [...SALES, "admin"],
  "bookings.edit_travellers": [...SALES, "operator", "admin"],
  "bookings.change_status": ["operator", "admin"],
  "bookings.request_cancellation": [...SALES, "operator", "admin"],
  // Clearing a booking from the "needs attention" queue with a note (spec Phase 4 step 18): money
  // reasons need an MFA-verified accountant or admin, a cancellation request an operator or admin
  // (attentionResolvers() and attention_resolvers() in the database decide per reason).
  "bookings.resolve_attention": ["operator", "accountant", "admin"],

  "payments.read": [...SALES, "operator", "accountant", "admin"],
  "payments.record": ["accountant", "admin"],
  "payments.refund": ["accountant", "admin"],

  "tours.read": STAFF_ROLES,
  "tours.edit_content": ["editor", "admin"],
  "departures.edit": ["operator", "admin"],
  // ADR-016: only admin edits departure prices (sales_manager does not).
  "prices.edit": ["admin"],

  "content.manage": ["editor", "admin"],
  "media.manage": ["editor", "admin"],
  "redirects.manage": ["editor", "admin"],
  "newsletter.manage": ["editor", "admin"],

  "customers.read": [...SALES, "operator", "accountant", "admin"],
  "customers.notes": [...SALES, "admin"],
  "customers.delete_data": ["admin"],

  "settings.manage": ["admin"],
  "staff.manage": ["admin"],
  "audit.read": ["admin"],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isStaffRole(role: Role | null | undefined): role is StaffRole {
  return role != null && (STAFF_ROLES as readonly Role[]).includes(role);
}

export function requiresMfa(role: Role | null | undefined): boolean {
  return role != null && (MFA_REQUIRED_ROLES as readonly Role[]).includes(role);
}

/** Roles allowed to perform a permission. */
export function rolesFor(permission: Permission): readonly StaffRole[] {
  return PERMISSIONS[permission];
}

/** Whether a role may perform a permission. Does not check MFA; requireRole() does. */
export function can(role: Role | null | undefined, permission: Permission): boolean {
  return role != null && (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
