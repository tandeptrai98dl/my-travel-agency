import { createClient } from "@supabase/supabase-js";
import { connection, NextResponse } from "next/server";

import { publicEnv } from "@/lib/env/public";
import type { Database } from "@/types/database.types";

/**
 * Uptime check (ARCHITECTURE.md "Monitoring"): `{ status, db }`, 200 when the database answers,
 * 503 otherwise. Uses the publishable key and a public, RLS-protected read, so it needs no
 * secrets and reveals nothing.
 */
export async function GET() {
  // Always run at request time; never prerender the result.
  await connection();

  const supabase = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  let db: "ok" | "error" = "error";
  try {
    const { error } = await supabase
      .from("settings")
      .select("key", { head: true, count: "exact" })
      .eq("is_public", true)
      .abortSignal(AbortSignal.timeout(3000));
    if (!error) db = "ok";
  } catch {
    db = "error";
  }

  const ok = db === "ok";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", db },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
