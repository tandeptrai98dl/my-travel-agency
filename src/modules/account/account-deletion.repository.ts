import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Customer data deletion (spec Phase 5 decision 8). The request, the state and the SQL step run
 * with the service role (definer functions granted to it only); the Auth steps use the Auth Admin
 * API. The admin's way in uses the admin's session, so admin_anonymise_customer() checks the role
 * and MFA again.
 */

export async function requestDeletion(profileId: string) {
  return createAdminClient().rpc("request_customer_deletion", { target_id: profileId });
}

export async function deletionState(profileId: string) {
  return createAdminClient().rpc("customer_deletion_state", { target_id: profileId });
}

export async function anonymise(profileId: string) {
  return createAdminClient().rpc("anonymise_customer", { target_id: profileId });
}

export async function anonymiseAsAdmin(profileId: string, note: string) {
  return (await createClient()).rpc("admin_anonymise_customer", { target_id: profileId, note });
}

/** Why a deletion must wait (read only; `request_customer_deletion()` also records the request). */
export async function deletionBlockers(profileId: string) {
  return createAdminClient().rpc("customer_deletion_blockers", { target_id: profileId });
}

/**
 * Blocks sign-in and token refresh at once, and drops the name kept in user metadata. GoTrue
 * merges `user_metadata` on update (a key set to null is removed, an empty object changes
 * nothing), so every key the user has is sent as null (PR 5D: 5B sent `{}`, which kept the name).
 */
export async function banUser(profileId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(profileId);
  if (error) return { data: null, error };
  const cleared = Object.fromEntries(Object.keys(data.user?.user_metadata ?? {}).map((key) => [key, null]));
  return admin.auth.admin.updateUserById(profileId, { ban_duration: "876000h", user_metadata: cleared });
}

/** Revokes every refresh token of the session's user (an issued access token lives until it expires). */
export async function revokeSessions(accessToken: string) {
  return createAdminClient().auth.admin.signOut(accessToken, "global");
}

/** GoTrue's soft delete: obfuscated email and phone, no password, identities, factors or sessions; the row stays. */
export async function softDeleteUser(profileId: string) {
  return createAdminClient().auth.admin.deleteUser(profileId, true);
}

export async function signOutHere() {
  return (await createClient()).auth.signOut({ scope: "local" });
}
