import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { AuditSort } from "./audit.schemas";

export type AuditQuery = {
  entityType?: string;
  entityId?: string;
  sort: AuditSort;
  dir: "asc" | "desc";
  range: [number, number];
};

/**
 * Reads the audit log with the staff member's session: RLS lets only an MFA-verified admin see
 * it (supabase/migrations/20261106121200_rls_policies.sql), after requireRole() in the service.
 */
export async function findAuditLogs(query: AuditQuery) {
  const supabase = await createClient();
  let request = supabase
    .from("audit_logs")
    .select("id, created_at, action, entity_type, entity_id, changes, ip, actor:profiles(id, email, full_name)", {
      count: "exact",
    })
    .order(query.sort, { ascending: query.dir === "asc" })
    .order("id", { ascending: false })
    .range(query.range[0], query.range[1]);
  if (query.entityType) request = request.eq("entity_type", query.entityType);
  if (query.entityId) request = request.eq("entity_id", query.entityId);
  return request;
}
