import "server-only";

import { notFound, redirect } from "next/navigation";

import { type CurrentUser, getCurrentUser } from "@/lib/auth/get-user";
import { type Role } from "@/lib/auth/permissions";
import { checkAccess } from "@/lib/auth/require-role";

/**
 * Page-level access check for the admin: signed-out visitors go to sign-in, non-staff get a 404
 * (the admin's existence is not advertised), and staff who still need MFA go to /admin/mfa.
 * Server Actions and Route Handlers use requireRole() instead; RLS applies to everything.
 */
export async function requireAdminAccess(roles: readonly Role[]): Promise<CurrentUser> {
  const decision = checkAccess(await getCurrentUser(), roles);
  if (decision.ok) return decision.user;

  switch (decision.reason) {
    case "unauthenticated":
      redirect("/auth/login");
    case "forbidden":
      notFound();
    case "mfa_enrollment_required":
    case "mfa_verification_required":
      redirect("/admin/mfa");
  }
}
