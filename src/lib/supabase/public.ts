import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env/public";
import type { Database } from "@/types/database.types";

/**
 * Session-less client with the publishable key, for public reads outside a user context
 * (health check, later "use cache" content reads). RLS applies as anon.
 */
export function createPublicClient() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
