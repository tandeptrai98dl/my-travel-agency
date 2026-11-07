import "server-only";

import { randomUUID } from "node:crypto";

import { localizedPath } from "@/i18n/paths";
import { requirePermission } from "@/lib/auth/require-role";
import { toCsv } from "@/lib/csv";
import { logger } from "@/lib/logger";
import { siteUrl } from "@/lib/site-url";

import { createUnsubscribeToken } from "./public/newsletter.token";

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
 * to. The export is recorded in the audit log first; without that row there is no file. Each row
 * gets a fresh single-use unsubscribe link (`unsubscribe_url`, in the subscriber's language),
 * which the campaign uses as a merge field (Phase 6 step 10a); only the token hashes are stored,
 * and without them there is no file either.
 */
export async function exportSubscribers(): Promise<ExportResult> {
  const user = await requirePermission("newsletter.manage");
  const rows: { id: string; email: string; locale: "vi" | "en"; source: string | null; confirmed_at: string | null; created_at: string }[] = [];
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
    changes: { count: rows.length, scope: "active", unsubscribe_links: true },
  });
  if (error) {
    logger.error("subscribers.export_audit_failed", { message: error.message });
    return { ok: false, error: "failed" };
  }
  const links = new Map<string, string>();
  for (let from = 0; from < rows.length; from += 1000) {
    const chunk = rows.slice(from, from + 1000).map((row) => ({ row, ...createUnsubscribeToken() }));
    const { data: issued, error: issueError } = await repo.issueUnsubscribeTokens(
      chunk.map((entry) => entry.row.id),
      chunk.map((entry) => entry.hash),
    );
    if (issueError || !Array.isArray(issued)) {
      logger.error("subscribers.export_tokens_failed", { code: issueError?.code ?? null });
      return { ok: false, error: "failed" };
    }
    // Only subscribers still active when their token was stored get one (#55 review m6).
    const stored = new Set(issued);
    for (const { row, token } of chunk) {
      if (!stored.has(row.id)) continue;
      links.set(row.id, new URL(localizedPath(row.locale, { pathname: "/newsletter/unsubscribe", query: { token } }), siteUrl).toString());
    }
  }
  // A subscriber who unsubscribed between the read and the tokens has no link and no longer agrees
  // to the newsletter: the row is left out, so no row carries a dead or empty link. The audit row
  // keeps the count read; the difference is logged (a count, no address).
  const exported = rows.filter((row) => links.has(row.id));
  if (exported.length < rows.length) logger.warn("subscribers.export_left_out", { count: rows.length - exported.length });
  const csv = toCsv(
    ["email", "locale", "source", "confirmed_at", "created_at", "unsubscribe_url"],
    exported.map((row) => [row.email, row.locale, row.source, row.confirmed_at, row.created_at, links.get(row.id)!]),
  );
  return { ok: true, csv, filename: `subscribers-${new Date().toISOString().slice(0, 10)}.csv`, count: exported.length };
}
