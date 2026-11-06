import * as Sentry from "@sentry/nextjs";

/**
 * Runs once when the server starts. Importing the env modules validates all environment
 * variables, so a misconfigured deployment fails immediately instead of on the first request
 * that needs a missing value. Then Sentry starts for the active runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env/server");
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/** Reports errors thrown while rendering, in Route Handlers, Server Actions and the proxy. */
export const onRequestError = Sentry.captureRequestError;
