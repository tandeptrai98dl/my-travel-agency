import "server-only";

import { createClient } from "@/lib/supabase/server";

/** The dashboard read with the staff session: `admin_dashboard()` checks the role and MFA again. */
export async function readDashboard() {
  return (await createClient()).rpc("admin_dashboard");
}
