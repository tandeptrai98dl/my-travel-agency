// Sentry in the browser, loaded lazily so it stays out of the initial JavaScript on public pages
// (budget: < 150 KB gzip, ARCHITECTURE.md "Performance"). Off unless NEXT_PUBLIC_SENTRY_DSN is
// set. Errors thrown before it loads are not reported from the browser; server errors always are.
import { publicEnv } from "@/lib/env/public";

const dsn = publicEnv.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  const start = () => {
    void Promise.all([import("@sentry/nextjs"), import("@/lib/monitoring/sentry-options")]).then(
      ([Sentry, { sentryOptions }]) => {
        Sentry.init(sentryOptions(dsn, "browser"));
      },
    );
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(start, { timeout: 5000 });
  } else {
    setTimeout(start, 3000);
  }
}
