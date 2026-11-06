import "server-only";

import { logger } from "@/lib/logger";

/**
 * Minimal Upstash Redis REST client (ADR-014, ADR-031): a pipeline of commands over `fetch`, no
 * SDK. Configured by UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (validated at startup by
 * src/lib/env/server.ts). Without both, callers get `{ configured: false }` and skip the sync.
 */
export type RedisCommand = (string | number)[];
export type RedisResult = { configured: false } | { configured: true; ok: true; results: unknown[] } | { configured: true; ok: false };

function config(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export function isRedisConfigured(): boolean {
  return config() !== null;
}

/** Runs the commands in one round trip; never throws (failures are logged and reported). */
export async function redisPipeline(commands: RedisCommand[]): Promise<RedisResult> {
  const settings = config();
  if (!settings) return { configured: false };
  if (commands.length === 0) return { configured: true, ok: true, results: [] };
  try {
    const response = await fetch(`${settings.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!response.ok) {
      logger.error("redis.request_failed", { status: response.status });
      return { configured: true, ok: false };
    }
    const body = (await response.json()) as { result?: unknown; error?: string }[];
    const failed = body.find((item) => item.error);
    if (failed) {
      logger.error("redis.command_failed", { error: failed.error });
      return { configured: true, ok: false };
    }
    return { configured: true, ok: true, results: body.map((item) => item.result) };
  } catch (error) {
    logger.error("redis.unreachable", { message: error instanceof Error ? error.message : "unknown" });
    return { configured: true, ok: false };
  }
}
