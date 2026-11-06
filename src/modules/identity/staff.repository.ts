import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database.types";

type Role = Database["public"]["Enums"]["user_role"];

const PROFILE_COLUMNS = "id, email, full_name, role, is_active, deleted_at, created_at";

// Reads and role/status changes use the admin's session, so RLS (`profiles: admin update`),
// guard_profile_update() and keep_active_admin() all apply and the audit trigger records the actor.

export async function listStaffProfiles() {
  return (await createClient())
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .neq("role", "customer")
    .order("is_active", { ascending: false })
    .order("email");
}

export async function findProfile(id: string) {
  return (await createClient()).from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
}

export async function activeAdminIds() {
  return (await createClient())
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true)
    .is("deleted_at", null);
}

export async function updateProfile(id: string, patch: { role?: Role; is_active?: boolean }) {
  return (await createClient()).from("profiles").update(patch).eq("id", id).select("id").maybeSingle();
}

// The Auth Admin API needs the service role. These run only after requirePermission("staff.manage")
// in staff.service.ts (spec Phase 2 step 22, ADR-032).

export async function authUser(id: string) {
  return createAdminClient().auth.admin.getUserById(id);
}

/** Whether an account already exists for the address (before inviting, so a rollback never removes it). */
export async function profileByEmail(email: string) {
  return createAdminClient().from("profiles").select("id").eq("email", email).maybeSingle();
}

export async function inviteUser(email: string, metadata: { full_name: string; locale: "vi" }, redirectTo: string) {
  return createAdminClient().auth.admin.inviteUserByEmail(email, { data: metadata, redirectTo });
}

/** The new account gets its role from the service role (trusted by guard_profile_update()). */
export async function setInvitedProfile(id: string, role: Role, fullName: string) {
  return createAdminClient().from("profiles").update({ role, full_name: fullName }).eq("id", id).select("id").single();
}

export async function deleteAuthUser(id: string) {
  return createAdminClient().auth.admin.deleteUser(id);
}

export async function insertAuditLog(row: { actor_id: string; action: string; entity_id: string; changes: Json }) {
  return createAdminClient().from("audit_logs").insert({ ...row, entity_type: "profiles" });
}
