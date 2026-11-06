import "server-only";

import { z } from "zod";

import { pageRange, type ListParams } from "@/lib/admin/list-params";
import { requirePermission } from "@/lib/auth/require-role";

import { findAuditLogs } from "./audit.repository";
import { type AuditEntry, type AuditSort, operationOf } from "./audit.schemas";

export type AuditPage = { entries: AuditEntry[]; total: number; pageCount: number };

/** One page of the audit log for an MFA-verified admin (permission `audit.read`). */
export async function listAuditLogs(params: ListParams<AuditSort>): Promise<AuditPage> {
  await requirePermission("audit.read");
  const entityId = z.uuid().safeParse(params.q).success ? params.q : undefined;
  const { data, error, count } = await findAuditLogs({
    entityType: params.filters.entity,
    entityId,
    sort: params.sort,
    dir: params.dir,
    range: pageRange(params),
  });
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
      ip: row.ip === null ? null : String(row.ip),
    };
  });
  const total = count ?? entries.length;
  return { entries, total, pageCount: Math.max(1, Math.ceil(total / params.pageSize)) };
}
