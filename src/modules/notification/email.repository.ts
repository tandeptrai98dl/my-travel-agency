import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

type Insert = Database["public"]["Tables"]["email_logs"]["Insert"];
type Update = Database["public"]["Tables"]["email_logs"]["Update"];

/** `email_logs` is written only by the service role (DATABASE.md "RLS policy summary"). */
export async function insertEmailLog(row: Insert) {
  return createAdminClient().from("email_logs").insert(row).select("id").single();
}

/** Records the outcome on the row claimed by `insertEmailLog`. */
export async function updateEmailLog(id: string, patch: Pick<Update, "status" | "provider_message_id" | "error">) {
  return createAdminClient().from("email_logs").update(patch).eq("id", id);
}

/** Dedupe keys already claimed for a booking (sent, failed, skipped or in flight). */
export async function claimedKeysForBooking(bookingId: string) {
  return createAdminClient().from("email_logs").select("dedupe_key").eq("booking_id", bookingId).not("dedupe_key", "is", null);
}
