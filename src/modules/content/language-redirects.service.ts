import "server-only";

import { after } from "next/server";

import { logger } from "@/lib/logger";
import { REDIS_LANGUAGE_REDIRECTS_HASH } from "@/lib/redirect-lookup";
import { isRedisConfigured, type RedisCommand, redisTransaction } from "@/lib/redis";

import { languagePairs, type SlugRoute } from "./language-redirects";
import * as repo from "./language-redirects.repository";

const STAGING = `${REDIS_LANGUAGE_REDIRECTS_HASH}:rebuild`;

const SOURCES: [() => PromiseLike<{ data: { id: string; locale: string; slug: string }[] | null; error: { message: string } | null }>, SlugRoute][] = [
  [repo.listTourSlugs, "/tours/[slug]"],
  [repo.listDestinationSlugs, "/destinations/[slug]"],
  [repo.listTravelStyleSlugs, "/travel-styles/[slug]"],
  [repo.listPostSlugs, "/journal/[slug]"],
  [repo.listTopicSlugs, "/journal/topics/[slug]"],
  [repo.listPolicySlugs, "/policies/[slug]"],
];

/**
 * Rebuilds the Redis hash `redirects:languages` from the published slugs (a full rebuild, swapped
 * in atomically, so a slug change or an unpublished language drops its old pairs). Never throws:
 * a failure is logged and the proxy falls back to Next.js's own 308.
 */
export async function rebuildLanguageRedirects(): Promise<{ synced: boolean; count: number }> {
  if (!isRedisConfigured()) return { synced: false, count: 0 };
  try {
    const results = await Promise.all(SOURCES.map(async ([read, route]) => {
      const { data, error } = await read();
      if (error) throw new Error(`${route}: ${error.message}`);
      return languagePairs(data ?? [], route);
    }));
    const pairs = results.flat();
    const commands: RedisCommand[] = pairs.length
      ? [
          ["DEL", STAGING],
          ...chunk(pairs, 500).map((part): RedisCommand => ["HSET", STAGING, ...part.flatMap(([from, to]) => [from, JSON.stringify({ to, status: 301 })])]),
          ["RENAME", STAGING, REDIS_LANGUAGE_REDIRECTS_HASH],
        ]
      : [["DEL", REDIS_LANGUAGE_REDIRECTS_HASH]];
    const result = await redisTransaction(commands);
    const synced = result.configured && result.ok;
    if (!synced) logger.error("language_redirects.sync_failed");
    return { synced, count: pairs.length };
  } catch (error) {
    logger.error("language_redirects.read_failed", { message: error instanceof Error ? error.message : "unknown" });
    return { synced: false, count: 0 };
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

/**
 * For content saves (tours, destinations, travel styles, articles, topics, policy pages): rebuilds
 * the other-language redirects after the response. A no-op without Upstash.
 */
export function scheduleLanguageRedirects(): void {
  if (!isRedisConfigured()) return;
  try {
    after(() => rebuildLanguageRedirects());
  } catch {
    // Outside a request (scripts, unit tests) there is no response to wait for: skip; the next
    // save or the redirect resync rebuilds the hash.
  }
}
