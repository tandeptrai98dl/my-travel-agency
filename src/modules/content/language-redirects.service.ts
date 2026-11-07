import "server-only";

import { after } from "next/server";

import { logger } from "@/lib/logger";
import { REDIS_LANGUAGE_REDIRECTS_HASH } from "@/lib/redirect-lookup";
import { isRedisConfigured, type RedisCommand, redisPipeline, redisTransaction } from "@/lib/redis";

import { languagePairs, type SlugRoute } from "./language-redirects";
import * as repo from "./language-redirects.repository";

/** Bumped when a rebuild starts; only the newest run may swap its result in. */
const GENERATION = `${REDIS_LANGUAGE_REDIRECTS_HASH}:generation`;
/** Each run fills its own staging hash, removed after a minute if the run dies half-way. */
const staging = (generation: number) => `${REDIS_LANGUAGE_REDIRECTS_HASH}:rebuild:${generation}`;
const STAGING_TTL_SECONDS = 60;

/**
 * Swaps the staging hash in only if no newer rebuild has started since (KEYS: staging, live hash,
 * generation; ARGV: this run's generation). An older, slower run can therefore never overwrite a
 * newer one: a run that starts later also reads the database later. Returns 1 when swapped.
 */
export const SWAP_IF_NEWEST = `if redis.call('GET', KEYS[3]) ~= ARGV[1] then redis.call('DEL', KEYS[1]) return 0 end
if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('RENAME', KEYS[1], KEYS[2]) else redis.call('DEL', KEYS[2]) end
return 1`;

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
 * in atomically, so a slug change or an unpublished language drops its old pairs). Concurrent
 * saves each start a rebuild: every run stages its own hash and only the newest swaps it in
 * (`SWAP_IF_NEWEST`). Never throws: a failure is logged and the proxy falls back to Next.js's own
 * 308.
 */
export async function rebuildLanguageRedirects(): Promise<{ synced: boolean; count: number }> {
  if (!isRedisConfigured()) return { synced: false, count: 0 };
  try {
    // Claim a generation before reading, so the newest run also holds the newest data.
    const claim = await redisPipeline([["INCR", GENERATION]]);
    const generation = claim.configured && claim.ok ? Number(claim.results[0]) : NaN;
    if (!Number.isInteger(generation)) {
      logger.error("language_redirects.sync_failed");
      return { synced: false, count: 0 };
    }
    const results = await Promise.all(SOURCES.map(async ([read, route]) => {
      const { data, error } = await read();
      if (error) throw new Error(`${route}: ${error.message}`);
      return languagePairs(data ?? [], route);
    }));
    const pairs = results.flat();
    const key = staging(generation);
    const commands: RedisCommand[] = [
      ["DEL", key],
      ...chunk(pairs, 500).map((part): RedisCommand => ["HSET", key, ...part.flatMap(([from, to]) => [from, JSON.stringify({ to, status: 301 })])]),
      ...(pairs.length ? [["EXPIRE", key, STAGING_TTL_SECONDS] as RedisCommand] : []),
      ["EVAL", SWAP_IF_NEWEST, 3, key, REDIS_LANGUAGE_REDIRECTS_HASH, GENERATION, String(generation)],
    ];
    const result = await redisTransaction(commands);
    if (!result.configured || !result.ok) {
      logger.error("language_redirects.sync_failed");
      return { synced: false, count: pairs.length };
    }
    // A newer rebuild started meanwhile and will swap its own (fresher) result in.
    if (Number(result.results.at(-1)) !== 1) logger.info("language_redirects.superseded", { generation });
    return { synced: true, count: pairs.length };
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
