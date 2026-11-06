"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/get-user";
import { isStaffRole } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { verifyTotpSchema } from "./identity.schemas";
import { enrolTotp, type TotpEnrolment, verifyTotp } from "./mfa.service";

export type StartEnrolmentResult = ({ ok: true } & TotpEnrolment) | { ok: false; error: "failed" };
export type VerifyResult = { ok: true } | { ok: false; error: "invalid_code" | "failed" };

/** MFA is managed by staff at any assurance level (that is how they reach aal2). */
async function requireStaffSession(): Promise<boolean> {
  const user = await getCurrentUser();
  return user != null && isStaffRole(user.role);
}

export async function startTotpEnrolment(): Promise<StartEnrolmentResult> {
  if (!(await requireStaffSession())) return { ok: false, error: "failed" };
  try {
    return { ok: true, ...(await enrolTotp(await createClient())) };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export async function verifyTotpCode(input: unknown): Promise<VerifyResult> {
  if (!(await requireStaffSession())) return { ok: false, error: "failed" };
  const parsed = verifyTotpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_code" };
  try {
    const outcome = await verifyTotp(await createClient(), parsed.data.code, parsed.data.factorId);
    return outcome === "verified" ? { ok: true } : { ok: false, error: "invalid_code" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Signs out this device only, then returns to sign-in. */
export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/auth/login");
}
