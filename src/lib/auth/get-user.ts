import "server-only";

import { cache } from "react";

import type { Role } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  locale: "vi" | "en";
  /** Assurance level of this session: `aal2` once a TOTP challenge was verified. */
  aal: "aal1" | "aal2";
  /** Whether the user has a verified MFA factor (so they can reach `aal2`). */
  hasVerifiedFactor: boolean;
};

export type AuthState =
  | { status: "signed_out" }
  /** Valid session, but the profile is deactivated, soft-deleted or missing. */
  | { status: "inactive" }
  | { status: "active"; user: CurrentUser };

/**
 * The session's state and, when active, the user and their profile.
 *
 * Identity comes from `auth.getClaims()`, which verifies the session JWT (signature check
 * against the project's keys, or a call to the Auth server), never from cookie contents alone
 * (ARCHITECTURE.md "Data flow"). The profile is read with the user's own session, so RLS
 * applies.
 *
 * Cached per request, so layouts, pages and actions can all call it.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (claimsError || !claims?.sub) return { status: "signed_out" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, locale, is_active, deleted_at")
    .eq("id", claims.sub)
    .maybeSingle();
  if (profileError || !profile || !profile.is_active || profile.deleted_at) {
    return { status: "inactive" };
  }

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  return {
    status: "active",
    user: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      locale: profile.locale,
      aal: claims.aal === "aal2" ? "aal2" : "aal1",
      // Only chooses which MFA screen to show; access decisions use the verified `aal` above.
      hasVerifiedFactor: assurance?.nextLevel === "aal2",
    },
  };
});

/** The active signed-in user, or null (signed out, deactivated or deleted). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const state = await getAuthState();
  return state.status === "active" ? state.user : null;
}
