import { z } from "zod";

import { STAFF_ROLES } from "@/lib/auth/permissions";

// Messages are keys in `Admin.Staff.errors`.

/** Invitation by an MFA-verified admin (spec Phase 2 step 22, decision 8): the role is chosen here. */
export const inviteStaffSchema = z.object({
  email: z.string().trim().toLowerCase().max(200, "tooLong").pipe(z.email("emailInvalid")),
  fullName: z.string().trim().min(1, "required").max(120, "tooLong"),
  role: z.enum(STAFF_ROLES, "roleInvalid"),
});
export type InviteStaffInput = z.input<typeof inviteStaffSchema>;
export type InviteStaffValues = z.output<typeof inviteStaffSchema>;

export const changeStaffRoleSchema = z.object({ id: z.uuid(), role: z.enum(STAFF_ROLES, "roleInvalid") });
export type ChangeStaffRoleValues = z.output<typeof changeStaffRoleSchema>;

export const setStaffActiveSchema = z.object({ id: z.uuid(), active: z.boolean() });
export type SetStaffActiveValues = z.output<typeof setStaffActiveSchema>;

export type StaffStatus = "invited" | "active" | "deactivated";

export type StaffMember = {
  id: string;
  email: string;
  name: string | null;
  role: (typeof STAFF_ROLES)[number];
  status: StaffStatus;
  /** A verified TOTP factor (required for admin and accountant before any action). */
  mfa: boolean;
  lastSignInAt: string | null;
  isSelf: boolean;
};

/** The guards the page and the service share: never yourself, never the last active admin. */
export function staffChangeBlock(
  target: { id: string; role: string; active: boolean },
  change: { role?: string; active?: boolean },
  context: { selfId: string; activeAdminIds: string[] },
): "selfChange" | "lastAdmin" | null {
  const losesAdmin =
    target.role === "admin" && target.active && ((change.role !== undefined && change.role !== "admin") || change.active === false);
  if (target.id === context.selfId && (losesAdmin || change.active === false || change.role !== undefined)) return "selfChange";
  if (losesAdmin && context.activeAdminIds.filter((id) => id !== target.id).length === 0) return "lastAdmin";
  return null;
}
