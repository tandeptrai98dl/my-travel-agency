import { isSitePath } from "./site-path";

/**
 * Redirects from Upstash Redis for the proxy (Phase 3 spec decision 14, ADR-031): the hashes
 * `redirects` (saved in the admin) and `redirects:languages` (other-language slugs) map a source
 * path to `{"to": "/target", "status": 301}`. Values are untrusted: the
 * target must be a site path (the admin's rules, plus no control characters), it is used exactly
 * as stored (never percent-decoded), and only 301 and 302 are honoured. Each lookup waits at most
 * 50 ms and fails open; hits and misses are cached per instance for 60 s.
 */

export type StoredRedirect = { to: string; status: 301 | 302 };

type Log = (event: string, fields?: Record<string, string | number>) => void;

type Options = {
  url: string;
  token: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  ttlMs?: number;
  /** After a failure, Redis is skipped for this long, so an outage costs one wait, not one per request. */
  backoffMs?: number;
  maxEntries?: number;
  log?: Log;
};

export const REDIS_REDIRECTS_HASH = "redirects";
/**
 * The other language's slug of each published page → this language's slug (301), rebuilt on
 * content saves (`src/modules/content/language-redirects.service.ts`). Next.js 16.4 stores a
 * re-rendered redirect without its Location header, so the proxy answers these first. Admin
 * redirects win when both have the path.
 */
export const REDIS_LANGUAGE_REDIRECTS_HASH = "redirects:languages";

/** A stored value as a redirect, or null when it is missing or breaks a rule (then logged). */
export function parseStoredRedirect(raw: unknown, log?: Log): StoredRedirect | null {
  if (raw === null || raw === undefined) return null;
  let value: unknown;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    log?.("redirects.invalid_value", { reason: "json" });
    return null;
  }
  const { to, status } = (value ?? {}) as { to?: unknown; status?: unknown };
  if (typeof to !== "string" || !isSitePath(to, { source: false }) || /[\u0000-\u001f\u007f]/.test(to)) {
    log?.("redirects.invalid_value", { reason: "target" });
    return null;
  }
  if (status !== 301 && status !== 302) {
    log?.("redirects.invalid_value", { reason: "status" });
    return null;
  }
  return { to, status };
}

/**
 * The keys a request path is looked up under: the path as received, and its decoded form when it
 * has percent escapes (the admin stores paths as typed, for example `/tour-cũ`).
 */
export function lookupKeys(pathname: string): string[] {
  if (!pathname.includes("%")) return [pathname];
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded === pathname ? [pathname] : [pathname, decoded];
  } catch {
    return [pathname];
  }
}

export function createRedirectLookup(options: Options) {
  const {
    url,
    token,
    fetch: fetchImpl = fetch,
    now = Date.now,
    timeoutMs = 50,
    ttlMs = 60_000,
    backoffMs = 10_000,
    maxEntries = 5_000,
    log,
  } = options;
  const endpoint = url.replace(/\/+$/, "");
  const cache = new Map<string, { value: StoredRedirect | null; expires: number }>();
  let skipUntil = 0;

  function remember(path: string, value: StoredRedirect | null) {
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
    cache.set(path, { value, expires: now() + ttlMs });
  }

  return async function lookup(pathname: string): Promise<StoredRedirect | null> {
    const cached = cache.get(pathname);
    if (cached && cached.expires > now()) return cached.value;
    if (cached) cache.delete(pathname);
    if (now() < skipUntil) return null;

    try {
      const keys = lookupKeys(pathname);
      const response = await fetchImpl(`${endpoint}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["HMGET", REDIS_REDIRECTS_HASH, ...keys],
          ["HMGET", REDIS_LANGUAGE_REDIRECTS_HASH, ...keys],
        ]),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const body = (await response.json()) as { result?: unknown; error?: string }[];
      if (!Array.isArray(body) || body.some((item) => item.error || !Array.isArray(item.result))) {
        throw new Error(body.find?.((item) => item.error)?.error ?? "unexpected reply");
      }
      const raw = body.flatMap((item) => item.result as unknown[]).find((item) => item !== null && item !== undefined) ?? null;
      const value = parseStoredRedirect(raw, log);
      remember(pathname, value);
      return value;
    } catch (error) {
      skipUntil = now() + backoffMs;
      log?.("redirects.lookup_failed", { message: error instanceof Error ? error.message : "unknown" });
      return null;
    }
  };
}
