/**
 * Shared Sentry options (server, edge and browser). Sentry stays off when no DSN is set, so
 * local development and CI send nothing.
 *
 * Privacy (ARCHITECTURE.md "Monitoring"): no default PII (no cookies, IPs or request bodies), and
 * request headers that carry credentials are dropped before sending.
 */
import type { ErrorEvent } from "@sentry/nextjs";

const SENSITIVE_HEADERS = ["authorization", "cookie", "set-cookie", "x-supabase-auth", "apikey"];

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const headers = event.request?.headers;
  if (headers) {
    for (const name of Object.keys(headers)) {
      if (SENSITIVE_HEADERS.includes(name.toLowerCase())) delete headers[name];
    }
  }
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
  }
  return event;
}

export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    // Errors always; a small share of traces for performance (raise when needed).
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
    beforeSend: scrubEvent,
  };
}
