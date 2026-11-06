import type { Metadata } from "next";

import { bodyFont } from "@/app/fonts";
import { siteUrl } from "@/lib/site-url";

import "../globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "Sign in", template: "%s | Premium Travel Agency" },
  robots: { index: false, follow: false },
};

/**
 * Root layout for the starter /auth pages (English), used by staff until the localized customer
 * auth pages arrive in Phase 5 (ARCHITECTURE.md).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${bodyFont.className} antialiased`}>{children}</body>
    </html>
  );
}
