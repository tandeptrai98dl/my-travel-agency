import "server-only";

import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { isRedisConfigured, type RedisCommand, redisPipeline, redisTransaction } from "@/lib/redis";

import * as repo from "./redirects.repository";
import { REDIRECTS_PAGE_SIZE, type RedirectValues } from "./redirects.schemas";

/**
 * Redirects (decisions 4 and 5, ADR-031). The `redirects` table is the source of truth; every save
 * also writes Redis, which the proxy reads (Phase 3): one hash, field = source path, value =
 * `{"to": "/target", "status": 301}`. Without the Upstash variables the Redis part is skipped and
 * logged, and "resync" rebuilds the hash from the table once Redis exists.
 */
export const REDIS_REDIRECTS_KEY = "redirects";
const REDIS_STAGING_KEY = "redirects:resync";

type Row = { from_path: string; to_path: string; status_code: number };
const entry = (row: Row) => JSON.stringify({ to: row.to_path, status: row.status_code });

async function sync(commands: RedisCommand[], op: string, atomic = false): Promise<boolean> {
  if (!isRedisConfigured()) {
    logger.info("redirects.redis_skipped", { op, reason: "not_configured" });
    return false;
  }
  const result = await (atomic ? redisTransaction(commands) : redisPipeline(commands));
  if (result.configured && !result.ok) logger.error("redirects.redis_sync_failed", { op });
  return result.configured && result.ok;
}

export type RedirectItem = { id: string; fromPath: string; toPath: string; statusCode: number; hits: number; createdAt: string };

/** PostgREST filter syntax is dropped from free-text search. */
function cleanSearch(q: string) {
  return q.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim();
}

export async function listRedirects(params: { q: string; page: number }) {
  await requirePermission("redirects.manage");
  const from = (params.page - 1) * REDIRECTS_PAGE_SIZE;
  const { data, error, count } = await repo.listRedirectRows({ q: cleanSearch(params.q), range: [from, from + REDIRECTS_PAGE_SIZE - 1] });
  if (error) throw new Error(`redirects query failed: ${error.message}`);
  const items: RedirectItem[] = (data ?? []).map((row) => ({
    id: row.id,
    fromPath: row.from_path,
    toPath: row.to_path,
    statusCode: row.status_code,
    hits: row.hits,
    createdAt: row.created_at,
  }));
  const total = count ?? items.length;
  return { items, total, pageCount: Math.max(1, Math.ceil(total / REDIRECTS_PAGE_SIZE)), redisConfigured: isRedisConfigured() };
}

export type RedirectResult = { ok: true; id: string; synced: boolean } | { ok: false; error: string; field?: string };

/**
 * Adds a redirect. A target that is itself redirected is refused (no chains); redirects that
 * pointed at the new source are moved to its target first, as slug changes do.
 */
export async function createRedirect(values: RedirectValues): Promise<RedirectResult> {
  await requirePermission("redirects.manage");
  const saved = await repo.createRedirect({ from_path: values.fromPath, to_path: values.toPath, status_code: values.statusCode });
  if (saved.error || !saved.data) return mapRedirectError(saved.error);
  // The new redirect and those flattened onto the same target.
  const rows: Row[] = (await repo.redirectsTo(values.toPath)).data ?? [];
  const synced = await sync([["HSET", REDIS_REDIRECTS_KEY, ...rows.flatMap((row) => [row.from_path, entry(row)])]], "create");
  return { ok: true, id: saved.data, synced };
}

function mapRedirectError(error: { code?: string; message?: string } | null): { ok: false; error: string; field?: string } {
  const text = error?.message ?? "";
  if (error?.code === "23505" || text.includes("already has a redirect")) return { ok: false, error: "fromTaken", field: "fromPath" };
  if (error?.code === "23514") {
    if (text.includes("target is itself redirected")) return { ok: false, error: "targetRedirected", field: "toPath" };
    if (text.includes("point to this path")) return { ok: false, error: "fromIsTarget", field: "fromPath" };
    if (text.includes("from_path")) return { ok: false, error: "pathInvalid", field: "fromPath" };
    if (text.includes("to_path") || text.includes("not_to_itself")) return { ok: false, error: "pathInvalid", field: "toPath" };
  }
  logger.error("redirects.write_failed", { code: error?.code, message: error?.message });
  return { ok: false, error: "failed" };
}

export async function deleteRedirect(id: string): Promise<{ ok: true; synced: boolean } | { ok: false; error: string }> {
  await requirePermission("redirects.manage");
  const { data, error } = await repo.deleteRedirectRow(id);
  if (error) return mapRedirectError(error);
  const removed = data?.[0];
  if (!removed) return { ok: false, error: "not_found" };
  return { ok: true, synced: await sync([["HDEL", REDIS_REDIRECTS_KEY, removed.from_path]], "delete") };
}

/** Rebuilds the Redis hash from the table (decision 5), swapped in at once with RENAME. */
export async function resyncRedirects(): Promise<{ ok: true; count: number; synced: boolean } | { ok: false; error: string }> {
  await requirePermission("redirects.manage");
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await repo.allRedirectRows(from, from + 999);
    if (error) throw new Error(`redirects query failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  if (!isRedisConfigured()) {
    logger.info("redirects.redis_skipped", { op: "resync", reason: "not_configured", count: rows.length });
    return { ok: true, count: rows.length, synced: false };
  }
  const commands: RedisCommand[] = [["DEL", REDIS_STAGING_KEY]];
  for (let i = 0; i < rows.length; i += 500) {
    commands.push(["HSET", REDIS_STAGING_KEY, ...rows.slice(i, i + 500).flatMap((row) => [row.from_path, entry(row)])]);
  }
  commands.push(rows.length ? ["RENAME", REDIS_STAGING_KEY, REDIS_REDIRECTS_KEY] : ["DEL", REDIS_REDIRECTS_KEY]);
  // All or nothing: the proxy never reads a half-built hash.
  const synced = await sync(commands, "resync", true);
  return synced ? { ok: true, count: rows.length, synced } : { ok: false, error: "syncFailed" };
}

/**
 * For the slug-change helpers in other modules (decision 4), after their database write: the new
 * redirect and the ones flattened onto the same target, and the target itself no longer redirected.
 */
export async function syncSlugRedirect(toPath: string): Promise<void> {
  if (!isRedisConfigured()) {
    logger.info("redirects.redis_skipped", { op: "slug_change", reason: "not_configured" });
    return;
  }
  const { data, error } = await repo.redirectsTo(toPath);
  if (error) {
    logger.error("redirects.redis_sync_failed", { op: "slug_change", message: error.message });
    return;
  }
  const rows = data ?? [];
  const commands: RedisCommand[] = [["HDEL", REDIS_REDIRECTS_KEY, toPath]];
  if (rows.length) commands.push(["HSET", REDIS_REDIRECTS_KEY, ...rows.flatMap((row) => [row.from_path, entry(row)])]);
  await sync(commands, "slug_change");
}
