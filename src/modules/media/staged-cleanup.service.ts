import "server-only";

import { logger } from "@/lib/logger";

import { listStaged, removeStagedMany } from "./media.repository";
import { listAllPages, STAGED_PAGE, stagedFolders, staleStagedPaths } from "./staged-cleanup";

/**
 * Removes staged originals older than 24 hours from `media-uploads` (ADR-023), for
 * `/api/cron/housekeeping`. Files go through the Storage API (deleting `storage.objects` rows
 * would leave the objects behind). Listing finishes before anything is removed, so offsets never
 * shift under the paging. Logs counts only.
 */
export async function cleanupStagedUploads(now: Date = new Date()): Promise<{ folders: number; removed: number; failed: number }> {
  const folders = stagedFolders(await listAllPages((offset, limit) => listStaged("pending", offset, limit)));
  const stale: string[] = [];
  for (const folder of folders) {
    const entries = await listAllPages((offset, limit) => listStaged(`pending/${folder}`, offset, limit));
    stale.push(...staleStagedPaths(folder, entries, now));
  }
  let removed = 0;
  let failed = 0;
  for (let i = 0; i < stale.length; i += STAGED_PAGE) {
    const batch = stale.slice(i, i + STAGED_PAGE);
    const { data, error } = await removeStagedMany(batch);
    if (error) {
      failed += batch.length;
      logger.error("media.staged_cleanup_failed", { count: batch.length, message: error.message });
    } else {
      removed += data?.length ?? 0;
    }
  }
  logger.info("media.staged_cleanup", { folders: folders.length, stale: stale.length, removed, failed });
  return { folders: folders.length, removed, failed };
}
