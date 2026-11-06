import type { Metadata } from "next";

import { bodyFont } from "@/app/fonts";
import { siteUrl } from "@/lib/site-url";

import "../globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "Quản trị", template: "%s | Quản trị" },
  robots: { index: false, follow: false },
};

/** Root layout of the Vietnamese-only admin (ADR-006). Access is checked in nested layouts. */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${bodyFont.className} antialiased`}>{children}</body>
    </html>
  );
}
