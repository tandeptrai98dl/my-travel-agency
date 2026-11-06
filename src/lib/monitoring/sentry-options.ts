/**
 * Shared Sentry options (server, edge and browser). Sentry stays off when no DSN is set, so
 * local development and CI send nothing.
 *
 * Privacy (ARCHITECTURE.md "Monitoring", Decree 13/2023): Sentry 11 controls collected data with
 * `dataCollection`, whose defaults collect almost everything (IPs, headers, bodies, query
 * strings). We turn collection off except a short allow-list of harmless headers, and also
 * scrub events before sending as a second layer.
 */
import type { Breadcrumb, BrowserOptions, ErrorEvent, NodeOptions } from "@sentry/nextjs";

/** The only request headers Sentry may record. */
const ALLOWED_HEADERS = ["user-agent", "accept-language", "content-type"];

export const dataCollection = {
  // No user fields from instrumentation; in the browser this also stops IP inference.
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ALLOWED_HEADERS }, response: false },
  // No request or response bodies (contact details, passwords, payment data).
  httpBodies: [],
  // Query strings can carry tokens and personal data (?code=, ?token_hash=, ?email=).
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
} satisfies NonNullable<NodeOptions["dataCollection"]> & NonNullable<BrowserOptions["dataCollection"]>;

/**
 * Path segments that are secrets: payment-link tokens (ARCHITECTURE.md Routes: `/pay/[token]`,
 * `/thanh-toan/link/[token]`).
 */
const SECRET_PATH_SEGMENTS = /(\/(?:pay|thanh-toan\/link)\/)[^/?#]+/g;

/** Removes the query string and fragment, and replaces secret path segments. */
export function redactUrl(url: string): string {
  return url.split(/[?#]/)[0]!.replace(SECRET_PATH_SEGMENTS, "$1[redacted]");
}

function redactUrlsIn(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && /url|target|from|to|route|path/i.test(key)) {
      data[key] = redactUrl(value);
    }
  }
}

/** Second layer: strips anything identifying that still reaches an error event. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.user) {
    const { id } = event.user;
    event.user = id ? { id: String(id) } : undefined;
  }
  if (event.request) {
    const headers = event.request.headers;
    if (headers) {
      for (const name of Object.keys(headers)) {
        if (!ALLOWED_HEADERS.includes(name.toLowerCase())) delete headers[name];
      }
    }
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    delete event.request.env;
    if (event.request.url) event.request.url = redactUrl(event.request.url);
  }
  const nextjs = event.contexts?.nextjs as Record<string, unknown> | undefined;
  redactUrlsIn(nextjs);
  for (const breadcrumb of event.breadcrumbs ?? []) scrubBreadcrumb(breadcrumb);
  event.breadcrumbs = event.breadcrumbs?.filter((breadcrumb) => breadcrumb.category !== "console");
  return event;
}

/** Drops console breadcrumbs (they can echo anything) and query strings from recorded URLs. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;
  redactUrlsIn(breadcrumb.data);
  return breadcrumb;
}

export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    dataCollection,
    // Errors only, on the server and in the browser: `tracesSampleRate` is left unset, which is
    // what disables tracing in Sentry (0 still creates spans and trace headers). Sentry 11 streams
    // server spans past beforeSendTransaction and Next.js adds raw `http.target` URLs, so tracing
    // stays off until span scrubbing (beforeSendSpan) is built and tested.
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  } satisfies NodeOptions & BrowserOptions;
}
