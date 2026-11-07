import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The passenger list with the staff session: `export_departure_passengers()` checks the role
 * (operator, admin at aal2) and writes the audit row before it returns anything.
 */
export async function exportPassengers(departureId: string) {
  return (await createClient()).rpc("export_departure_passengers", { target_id: departureId });
}
