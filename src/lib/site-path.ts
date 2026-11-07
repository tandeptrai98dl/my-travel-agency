/**
 * A path on this site (redirect sources and targets, ADR-031): starts with one "/", no spaces or
 * backslashes, at most 500 characters; sources are never "/" and carry no query or fragment.
 * Shared by the redirect form (`redirects.schemas.ts`) and the proxy, which re-checks values read
 * from Redis (Phase 3 spec decision 14). No Zod here: the proxy imports it.
 */
export function isSitePath(value: string, { source }: { source: boolean }): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.length > 500) return false;
  if (/[\s\\]/.test(value)) return false;
  if (source && (value === "/" || /[?#]/.test(value))) return false;
  return true;
}
