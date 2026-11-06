import { connection, NextResponse } from "next/server";

import { AccessDeniedError, requireRole } from "@/lib/auth/require-role";

/**
 * Deliberately throws so an admin can confirm errors reach Sentry (Phase 0 acceptance:
 * "a test error reaches Sentry"). Admin at aal2 only; everyone else gets 401/403. POST, so a
 * visited link never triggers it.
 */
export async function POST() {
  await connection();
  try {
    await requireRole(["admin"]);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      const status = error.reason === "unauthenticated" ? 401 : 403;
      return NextResponse.json({ error: error.reason }, { status });
    }
    throw error;
  }
  throw new Error("Sentry test error (requested by an admin)");
}
