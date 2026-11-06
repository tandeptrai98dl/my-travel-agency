import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

type Client = SupabaseClient<Database>;

export type TotpEnrolment = { factorId: string; qrCode: string; secret: string };

export class MfaEnrolmentNotAllowedError extends Error {
  constructor() {
    super("A verified factor exists; verify it (aal2) before enrolling another one");
    this.name = "MfaEnrolmentNotAllowedError";
  }
}

/**
 * Starts TOTP enrolment for the session's user. Abandoned, never-verified factors are removed
 * first so a fresh enrolment can start.
 *
 * Refused when the user already has a verified factor and this session is only aal1: otherwise
 * a stolen password alone could add a second factor and reach aal2. We enforce this ourselves
 * rather than relying on Supabase Auth's own check.
 */
export async function enrolTotp(
  supabase: Client,
  sessionAal: "aal1" | "aal2",
): Promise<TotpEnrolment> {
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) throw listError;
  if (sessionAal !== "aal2" && factors.all.some((factor) => factor.status === "verified")) {
    throw new MfaEnrolmentNotAllowedError();
  }
  for (const factor of factors.all) {
    if (factor.status === "unverified") {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 19)}`,
  });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Verifies a TOTP code against the given factor (it must belong to this user) or, when none is
 * given, the user's verified TOTP factor. Success upgrades the session to aal2 (Supabase rewrites
 * the session cookie).
 */
export async function verifyTotp(
  supabase: Client,
  code: string,
  factorId?: string,
): Promise<"verified" | "invalid_code"> {
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) throw listError;

  // listFactors() returns only this user's factors, so a factorId sent by the browser that is
  // not in the list is rejected.
  const id = factorId
    ? factors.all.find((factor) => factor.id === factorId)?.id
    : factors.totp.find((factor) => factor.status === "verified")?.id;
  if (!id) return "invalid_code";

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code });
  return error ? "invalid_code" : "verified";
}
