import "server-only";

import { randomUUID } from "node:crypto";

import { requirePermission } from "@/lib/auth/require-role";
import { toCsv } from "@/lib/csv";
import { logger } from "@/lib/logger";

import * as repo from "./subscribers.repository";
import { type SubscriberState, SUBSCRIBERS_PAGE_SIZE } from "./subscribers.schemas";

export type SubscriberItem = {
  id: string;
  email: string;
  locale: "vi" | "en";
  source: string | null;
  state: SubscriberState;
  confirmedAt: string | null;
  createdAt: string;
};

function stateOf(row: { confirmed_at: string | null; unsubscribed_at: string | null }): SubscriberState {
  if (row.unsubscribed_at) return "unsubscribed";
  return row.confirmed_at ? "active" : "pending";
}

/** PostgREST filter syntax is dropped from free-text search. */
function cleanSearch(q: string) {
  return q.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim();
}

export async function listSubscribers(params: { q: string; filters: Record<string, string>; page: number }) {
  await requirePermission("newsletter.manage");
  const from = (params.page - 1) * SUBSCRIBERS_PAGE_SIZE;
  const { data, error, count } = await repo.listSubscriberRows({
    q: cleanSearch(params.q),
    state: params.filters.state as SubscriberState | undefined,
    range: [from, from + SUBSCRIBERS_PAGE_SIZE - 1],
  });
  if (error) throw new Error(`subscribers query failed: ${error.message}`);
  const items: SubscriberItem[] = (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    locale: row.locale,
    source: row.source,
    state: stateOf(row),
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  }));
  const total = count ?? items.length;
  return { items, total, pageCount: Math.max(1, Math.ceil(total / SUBSCRIBERS_PAGE_SIZE)) };
}

export type ExportResult = { ok: true; csv: string; filename: string; count: number } | { ok: false; error: "failed" };

/**
 * CSV of the active (confirmed, not unsubscribed) subscribers, the only ones a newsletter may go
 * to. The export is recorded in the audit log first; without that row there is no file.
 */
export async function exportSubscribers(): Promise<ExportResult> {
  const user = await requirePermission("newsletter.manage");
  const rows: { email: string; locale: string; source: string | null; confirmed_at: string | null; created_at: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await repo.activeSubscriberRows(from, from + 999);
    if (error) throw new Error(`subscribers query failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const { error } = await repo.writeAuditRow({
    actor_id: user.id,
    action: "subscribers.export",
    entity_type: "subscribers",
    entity_id: randomUUID(),
    changes: { count: rows.length, scope: "active" },
  });
  if (error) {
    logger.error("subscribers.export_audit_failed", { message: error.message });
    return { ok: false, error: "failed" };
  }
  const csv = toCsv(
    ["email", "locale", "source", "confirmed_at", "created_at"],
    rows.map((row) => [row.email, row.locale, row.source, row.confirmed_at, row.created_at]),
  );
  return { ok: true, csv, filename: `subscribers-${new Date().toISOString().slice(0, 10)}.csv`, count: rows.length };
}
