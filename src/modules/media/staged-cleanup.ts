import { STAGED_PATH } from "./media.schemas";

/**
 * The daily cleanup of abandoned uploads (ADR-023; docs/specs/phase-6-hardening-launch.md
 * decision 4): an original staged in `media-uploads/pending/<user id>/` whose check never ran
 * stays private, and is removed once it is older than 24 hours. Storage `list()` is not recursive
 * and returns at most one page, so the job lists `pending/`, then each user folder, page by page.
 */

export const STAGED_MAX_AGE_MS = 24 * 3_600_000;
export const STAGED_PAGE = 100;
/** A runaway listing (a provider that keeps answering full pages) stops here. */
const MAX_PAGES = 1_000;

export type StagedEntry = { name: string; id: string | null; created_at: string | null };
type Page = { data: StagedEntry[] | null; error: { message?: string } | null };

/** Every entry under a prefix, page by page, until a page comes back shorter than `limit`. */
export async function listAllPages(fetchPage: (offset: number, limit: number) => Promise<Page>, limit = STAGED_PAGE): Promise<StagedEntry[]> {
  const entries: StagedEntry[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await fetchPage(page * limit, limit);
    if (error) throw new Error(`storage list failed: ${error.message ?? "unknown"}`);
    entries.push(...(data ?? []));
    if (!data || data.length < limit) return entries;
  }
  throw new Error("storage list did not end");
}

/** User folders under `pending/`: folders only (`id` null), named like a user id. */
export function stagedFolders(entries: StagedEntry[]): string[] {
  return entries.filter((entry) => entry.id === null && /^[0-9a-f-]{36}$/.test(entry.name)).map((entry) => entry.name);
}

/**
 * Paths in one user folder that are safe to remove: files (not folders) whose full path matches
 * `STAGED_PATH` (the server's own naming) and that were created more than 24 hours before `now`.
 * Anything unexpected (another name, no creation time, a bad date) is left alone.
 */
export function staleStagedPaths(folder: string, entries: StagedEntry[], now: Date): string[] {
  const cutoff = now.getTime() - STAGED_MAX_AGE_MS;
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.id === null || !entry.created_at) continue;
    const path = `pending/${folder}/${entry.name}`;
    const created = Date.parse(entry.created_at);
    if (STAGED_PATH.test(path) && Number.isFinite(created) && created < cutoff) paths.push(path);
  }
  return paths;
}
