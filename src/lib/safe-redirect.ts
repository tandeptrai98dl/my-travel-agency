const BASE = "http://internal.invalid";

/**
 * Returns `value` only if it is a same-site path ("/admin", "/en/tours?page=2"); otherwise the
 * fallback. Blocks open redirects through `?next=` (absolute URLs, "//host", "/\\host").
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
