"use client";

import { useEffect } from "react";

import { publicEnv } from "@/lib/env/public";

/**
 * Last-resort error page for errors thrown by a root layout. Reports the error to Sentry (loaded
 * on demand, so it adds nothing to normal page loads) and shows a bilingual message.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (!publicEnv.NEXT_PUBLIC_SENTRY_DSN) return;
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
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
