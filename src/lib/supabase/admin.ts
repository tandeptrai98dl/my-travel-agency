import "server-only";

import { createClient } from "@supabase/supabase-js";

import { serverEnv, validatedPublicEnv } from "@/lib/env/server";
import type { Database } from "@/types/database.types";

/**
 * Service-role client. It bypasses RLS, so it is used only inside server-side `src/modules/*`
 * for payment webhooks, cron jobs and guest writes after Zod validation, Turnstile and rate
 * limiting (ARCHITECTURE.md "Supabase clients"). Never import it from components or routes.
 *
 * Create one per request or job; it keeps no session.
 */
export function createAdminClient() {
  return createClient<Database>(
    validatedPublicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    },
  );
}
