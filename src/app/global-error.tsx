"use client";

import { useEffect } from "react";

import { publicEnv } from "@/lib/env/public";

/**
 * Last-resort error page for errors thrown by a root layout. Reports the error to Sentry (loaded
 * on demand, so it adds nothing to normal page loads; initialised here if the idle-time start in
 * instrumentation-client.ts has not run yet) and shows a bilingual message.
 *
 * The text is inline and unstyled on purpose: this page replaces the root layouts, so neither the
 * messages files nor the design tokens are available when it renders.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (!publicEnv.NEXT_PUBLIC_SENTRY_DSN) return;
    const dsn = publicEnv.NEXT_PUBLIC_SENTRY_DSN;
    void Promise.all([import("@sentry/nextjs"), import("@/lib/monitoring/sentry-options")]).then(
      ([Sentry, { sentryOptions }]) => {
        if (!Sentry.isInitialized()) Sentry.init(sentryOptions(dsn));
        Sentry.captureException(error);
      },
    );
  }, [error]);

  return (
    <html lang="vi">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center" }}>
        <h1>Đã có lỗi xảy ra · Something went wrong</h1>
        <p>Vui lòng tải lại trang. · Please reload the page.</p>
      </body>
    </html>
  );
}
