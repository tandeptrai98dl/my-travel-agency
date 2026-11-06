const BASE = "http://internal.invalid";

/**
 * Returns `value` only if it is a same-site path ("/admin", "/en/tours?page=2"); otherwise the
 * fallback. Blocks open redirects through `?next=`: absolute URLs, protocol-relative "//host",
 * "/\\host", and paths that only become "//host" after normalisation ("/.//host", "/a/..//host",
 * "/%2e//host"). The check runs on the normalised result, which is what the browser receives.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/")) return fallback;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (path.startsWith("//") || path.startsWith("/\\") || /[\u0000-\u001f\\]/.test(url.pathname)) {
    return fallback;
  }
  return path;
}
