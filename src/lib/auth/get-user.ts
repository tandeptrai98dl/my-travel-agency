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

/**
 * The signed-in user and their profile, or null.
 *
 * Identity comes from `auth.getClaims()`, which verifies the session JWT (signature check
 * against the project's keys, or a call to the Auth server), never from cookie contents alone
 * (ARCHITECTURE.md "Data flow"). The profile is read with the user's own session, so RLS
 * applies. Deactivated or soft-deleted profiles count as signed out.
 *
 * Cached per request, so layouts, pages and actions can all call it.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (claimsError || !claims?.sub) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, locale, is_active, deleted_at")
    .eq("id", claims.sub)
    .maybeSingle();
  if (profileError || !profile || !profile.is_active || profile.deleted_at) return null;

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    locale: profile.locale,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    hasVerifiedFactor: assurance?.nextLevel === "aal2",
  };
});
