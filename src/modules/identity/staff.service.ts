import "server-only";

import { validatedPublicEnv } from "@/lib/env/server";
import { requirePermission } from "@/lib/auth/require-role";
import { isStaffRole } from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";

import * as repo from "./staff.repository";
import {
  type ChangeStaffRoleValues,
  type InviteStaffValues,
  type SetStaffActiveValues,
  staffChangeBlock,
  type StaffMember,
} from "./staff.schemas";

export type StaffResult = { ok: true; id?: string } | { ok: false; error: string; field?: string };

/** Staff accounts with their sign-in and MFA state (admin at aal2). */
export async function listStaff(): Promise<StaffMember[]> {
  const user = await requirePermission("staff.manage");
  const { data, error } = await repo.listStaffProfiles();
  if (error) throw new Error(`staff query failed: ${error.message}`);
  const rows = (data ?? []).filter((row) => isStaffRole(row.role));
  // A handful of staff: one Auth Admin lookup each, in parallel.
  const auth = await Promise.all(rows.map((row) => repo.authUser(row.id)));
  return rows.map((row, index) => {
    const account = auth[index].data?.user;
    const confirmed = Boolean(account?.email_confirmed_at || account?.last_sign_in_at);
    return {
      id: row.id,
      email: row.email,
      name: row.full_name,
      role: row.role as StaffMember["role"],
      status: !row.is_active || row.deleted_at ? "deactivated" : confirmed ? "active" : "invited",
      mfa: (account?.factors ?? []).some((factor) => factor.factor_type === "totp" && factor.status === "verified"),
      lastSignInAt: account?.last_sign_in_at ?? null,
      isSelf: row.id === user.id,
    };
  });
}

/** Staff for the audit-log actor filter. */
export async function listStaffOptions(): Promise<{ id: string; label: string }[]> {
  await requirePermission("staff.manage");
  const { data } = await repo.listStaffProfiles();
  return (data ?? []).map((row) => ({ id: row.id, label: row.full_name ? `${row.full_name} (${row.email})` : row.email }));
}

function isEmailTaken(error: { code?: string; status?: number; message: string }) {
  return error.code === "email_exists" || error.status === 422 || /already been registered/i.test(error.message);
}

/**
 * Invites a staff member (decision 8): Supabase sends the invitation email, the profile gets the
 * chosen role, and an `audit_logs` row names the inviting admin. If the role or the audit row
 * cannot be written, the invited account is removed again, so no unaudited staff account exists.
 */
export async function inviteStaff(input: InviteStaffValues): Promise<StaffResult> {
  const user = await requirePermission("staff.manage");
  const redirectTo = new URL("/auth/update-password", validatedPublicEnv.NEXT_PUBLIC_SITE_URL).toString();
  // An unconfirmed account (an earlier invitation, an unfinished sign-up) is invited again rather
  // than created; a rollback must never remove it.
  const prior = await repo.profileByEmail(input.email);
  if (prior.error) {
    logger.error("staff.invite_lookup_failed", { code: prior.error.code });
    return { ok: false, error: "failed" };
  }
  const invited = await repo.inviteUser(input.email, { full_name: input.fullName, locale: "vi" }, redirectTo);
  if (invited.error || !invited.data.user) {
    if (invited.error && isEmailTaken(invited.error)) return { ok: false, error: "emailTaken", field: "email" };
    logger.error("staff.invite_failed", { code: invited.error?.code, status: invited.error?.status });
    return { ok: false, error: "inviteFailed" };
  }
  const id = invited.data.user.id;
  const profile = await repo.setInvitedProfile(id, input.role, input.fullName);
  const audit = profile.error
    ? null
    : await repo.insertAuditLog({ actor_id: user.id, action: "staff.invite", entity_id: id, changes: { after: { role: input.role } } });
  if (profile.error || !audit || audit.error) {
    logger.error("staff.invite_write_failed", { code: profile.error?.code ?? audit?.error?.code });
    if (!prior.data) {
      const removed = await repo.deleteAuthUser(id);
      if (removed.error) logger.error("staff.invite_rollback_failed", { code: removed.error.code, status: removed.error.status });
      else logger.info("staff.invite_rolled_back", {});
    }
    return { ok: false, error: "failed" };
  }
  return { ok: true, id };
}

type Change = { role?: StaffMember["role"]; active?: boolean };

async function applyChange(id: string, change: Change): Promise<StaffResult> {
  const user = await requirePermission("staff.manage");
  const [{ data: target }, { data: admins }] = await Promise.all([repo.findProfile(id), repo.activeAdminIds()]);
  if (!target || !isStaffRole(target.role)) return { ok: false, error: "notFound" };
  const block = staffChangeBlock(
    { id: target.id, role: target.role, active: target.is_active && !target.deleted_at },
    change,
    { selfId: user.id, activeAdminIds: (admins ?? []).map((row) => row.id) },
  );
  if (block) return { ok: false, error: block };
  const { data, error } = await repo.updateProfile(id, {
    ...(change.role !== undefined ? { role: change.role } : {}),
    ...(change.active !== undefined ? { is_active: change.active } : {}),
  });
  if (error) {
    // The database rules (keep_active_admin, guard_profile_update) are the final check.
    if (/remove their own admin access/.test(error.message)) return { ok: false, error: "selfChange" };
    if (/last active admin/.test(error.message)) return { ok: false, error: "lastAdmin" };
    logger.error("staff.update_failed", { code: error.code });
    return { ok: false, error: error.code === "42501" ? "forbidden" : "failed" };
  }
  // RLS hid the row (no admin update right): nothing changed.
  if (!data) return { ok: false, error: "forbidden" };
  return { ok: true, id };
}

export function changeStaffRole(input: ChangeStaffRoleValues): Promise<StaffResult> {
  return applyChange(input.id, { role: input.role });
}

export function setStaffActive(input: SetStaffActiveValues): Promise<StaffResult> {
  return applyChange(input.id, { active: input.active });
}
