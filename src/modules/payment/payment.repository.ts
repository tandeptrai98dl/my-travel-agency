import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database.types";

type Provider = Database["public"]["Enums"]["payment_provider"];

/**
 * Gateway results reach the database only through record_payment_event() (ADR-012); this module
 * reads with the service role (webhooks have no user) and never writes payments directly.
 */
const db = createAdminClient;

export async function findPaymentByReference(reference: string, provider: Provider) {
  return db()
    .from("payments")
    .select("id, booking_id, amount, status, kind, bookings!inner(code, locale, tour_id)")
    .ilike("reference", reference.replace(/[%_\\]/g, ""))
    .eq("provider", provider)
    .neq("kind", "refund")
    .maybeSingle();
}

export async function recordPaymentEvent(event: {
  provider: Provider;
  eventKey: string;
  payload: Json;
  reference: string;
  amount: number;
  providerTxnId: string | null;
  succeeded: boolean;
}) {
  return db().rpc("record_payment_event", {
    provider: event.provider,
    event_key: event.eventKey,
    payload: event.payload,
    reference: event.reference,
    amount: event.amount,
    provider_txn_id: event.providerTxnId as string,
    succeeded: event.succeeded,
  });
}

export async function bankAccountSetting() {
  return db().from("settings").select("value").eq("key", "bank_account").maybeSingle();
}
