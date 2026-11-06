import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

/** `email_logs` is written only by the service role (DATABASE.md "RLS policy summary"). */
export async function insertEmailLog(row: Database["public"]["Tables"]["email_logs"]["Insert"]) {
  return createAdminClient().from("email_logs").insert(row);
}
