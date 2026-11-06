import "server-only";

import { z } from "zod";

import { pageRange, type ListParams } from "@/lib/admin/list-params";
import { requirePermission } from "@/lib/auth/require-role";

import { findAuditLogs } from "./audit.repository";
import { type AuditEntry, type AuditSort, operationOf } from "./audit.schemas";

export type AuditPage = {
  entries: AuditEntry[];
  total: number;
  pageCount: number;
  /** The entity-ID search was not a UUID, so it was not applied. */
  invalidEntityId: boolean;
};

/** One page of the audit log for an MFA-verified admin (permission `audit.read`). */
export async function listAuditLogs(params: ListParams<AuditSort>): Promise<AuditPage> {
  await requirePermission("audit.read");
  const entityId = z.guid().safeParse(params.q).success ? params.q : undefined;
  const invalidEntityId = params.q !== "" && entityId === undefined;
  const query = {
    entityType: params.filters.entity,
    entityId,
    sort: params.sort,
    dir: params.dir,
  };
  let { data, error, count } = await findAuditLogs({ ...query, range: pageRange(params) });
  if (error?.code === "PGRST103") {
    // A page past the end (old link, fewer rows now): show an empty page with the real total.
    ({ data, error, count } = await findAuditLogs({ ...query, range: [0, 0] }));
    data = [];
  }
  if (error) throw new Error(`audit log query failed: ${error.message}`);

  const entries: AuditEntry[] = (data ?? []).map((row) => {
    const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;
    return {
      id: row.id,
      createdAt: row.created_at,
      action: row.action,
      operation: operationOf(row.action),
      entityType: row.entity_type,
      entityId: row.entity_id,
      actor: actor ? { id: actor.id, email: actor.email, name: actor.full_name } : null,
      changes: row.changes,
    };
  });
  const total = count ?? entries.length;
  return { entries, total, pageCount: Math.max(1, Math.ceil(total / params.pageSize)), invalidEntityId };
}
