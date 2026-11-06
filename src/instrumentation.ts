/**
 * Runs once when the server starts. Importing the env modules validates all
 * environment variables, so a misconfigured deployment fails immediately
 * instead of on the first request that needs a missing value.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env/server");
  }
}
