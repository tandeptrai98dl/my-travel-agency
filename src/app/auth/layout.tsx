import type { Metadata } from "next";

import { fontVariables } from "@/app/fonts";
import { siteUrl } from "@/lib/site-url";

import "../globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "Đăng nhập nhân viên", template: "%s | Quản trị" },
  robots: { index: false, follow: false },
};

/**
 * Root layout of the staff `/auth` pages (Vietnamese, the admin language; docs/specs/
 * phase-5-accounts-inquiries-operations.md decision 1). They keep the public nonce-free CSP
 * (ADR-027): static forms that post to Server Actions and show no booking or customer data.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={fontVariables}>
      <body className="min-h-svh bg-background">
        <main id="main" className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-[28rem]">{children}</div>
        </main>
      </body>
    </html>
  );
}
