import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Auth Admin API for test setup only (E2E_SUPABASE_URL / E2E_SUPABASE_SECRET_KEY, set by
 * CI from the local stack). Never used by the app under test.
 */
export function adminApi() {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("E2E_SUPABASE_URL and E2E_SUPABASE_SECRET_KEY must be set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A fresh, single-use email-link token (the `token_hash` in the confirmation link). */
export async function magicLinkTokenHash(email: string): Promise<string> {
  const { data, error } = await adminApi().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  return data.properties.hashed_token;
}
