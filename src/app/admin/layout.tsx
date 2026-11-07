import type { Metadata } from "next";
import { connection } from "next/server";

import { fontVariables } from "@/app/fonts";
import { siteUrl } from "@/lib/site-url";

import "../globals.css";

// Nothing in the admin is prerendered (ADR-027 option 2): every script must carry the nonce the
// proxy sends with its CSP.
export const instant = false;

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "Quản trị", template: "%s | Quản trị" },
  robots: { index: false, follow: false },
};

/** Root layout of the Vietnamese-only admin (ADR-006). Access is checked in nested layouts. */
export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="vi" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
