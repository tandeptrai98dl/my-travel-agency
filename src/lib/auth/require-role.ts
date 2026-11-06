import "server-only";

import { type CurrentUser, getCurrentUser } from "@/lib/auth/get-user";
import { type Permission, type Role, requiresMfa, rolesFor } from "@/lib/auth/permissions";

export type AccessDenialReason =
  | "unauthenticated"
  | "forbidden"
  | "mfa_enrollment_required"
  | "mfa_verification_required";

export type AccessDecision =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: AccessDenialReason };

/**
 * Pure access rule: the user must be signed in and hold one of the roles; admin and accountant
 * must also be at `aal2` (ADR-009). Unit-tested; requireRole() and the admin layout use it.
 */
export function checkAccess(user: CurrentUser | null, roles: readonly Role[]): AccessDecision {
  if (!user) return { ok: false, reason: "unauthenticated" };
  if (!roles.includes(user.role)) return { ok: false, reason: "forbidden" };
  if (requiresMfa(user.role) && user.aal !== "aal2") {
    return {
      ok: false,
      reason: user.hasVerifiedFactor ? "mfa_verification_required" : "mfa_enrollment_required",
    };
  }
  return { ok: true, user };
}

export class AccessDeniedError extends Error {
  constructor(readonly reason: AccessDenialReason) {
    super(`Access denied: ${reason}`);
    this.name = "AccessDeniedError";
  }
}

/**
 * First check in every staff Server Action and Route Handler (CLAUDE.md conventions).
 * Returns the user or throws AccessDeniedError. RLS still applies afterwards.
 */
export async function requireRole(roles: readonly Role[]): Promise<CurrentUser> {
  const decision = checkAccess(await getCurrentUser(), roles);
  if (!decision.ok) throw new AccessDeniedError(decision.reason);
  return decision.user;
}

/** requireRole() for the roles that hold a permission in the matrix. */
export function requirePermission(permission: Permission): Promise<CurrentUser> {
  return requireRole(rolesFor(permission));
}
