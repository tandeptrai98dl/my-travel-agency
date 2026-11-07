import type { CSSProperties, ReactNode } from "react";

/**
 * Brand layout for transactional email (DESIGN_SYSTEM.md "Email"): a 600 px table layout that
 * survives Outlook and Gmail, ivory page, white card, navy text and buttons, a thin gold rule.
 * Email clients do not load the site's fonts, so the serif and sans faces fall back to Georgia
 * and Arial. All text goes through React, which escapes it; no raw HTML is ever injected.
 */
export const palette = {
  navy: "#0F1B2D",
  ivory: "#F7F3EC",
  gold: "#C9A96E",
  white: "#FFFFFF",
  muted: "#726D65",
  border: "#E2DBCF",
} as const;

const serif = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const sans = "'Be Vietnam Pro', Arial, Helvetica, sans-serif";

export type EmailBrand = { name: string; email: string | null; phone: string | null };

type LayoutProps = {
  lang: "vi" | "en";
  /** Inbox preview text, hidden in the body. */
  preview: string;
  brand: EmailBrand;
  /** Why the reader receives this email, shown in the footer. */
  reason: string;
  children: ReactNode;
};

export function EmailLayout({ lang, preview, brand, reason, children }: LayoutProps) {
  return (
    <html lang={lang} dir="ltr">
      {/* An email document, not a Next.js page: next/head does not apply. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: palette.ivory, color: palette.navy, fontFamily: sans }}>
        <div data-preview="" style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0, fontSize: 1, lineHeight: "1px" }}>{preview}</div>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: palette.ivory }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "40px 16px" }}>
                <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ maxWidth: 600 }}>
                  <tbody>
                    <tr>
                      <td align="center" style={{ paddingBottom: 24 }}>
                        <p style={{ margin: 0, fontFamily: serif, fontSize: 24, lineHeight: "32px", letterSpacing: "0.2em", textTransform: "uppercase", color: palette.navy }}>
                          {brand.name}
                        </p>
                        <div style={{ width: 48, height: 1, backgroundColor: palette.gold, margin: "16px auto 0" }} />
                      </td>
                    </tr>
                    <tr>
                      <td style={{ backgroundColor: palette.white, border: `1px solid ${palette.border}`, borderRadius: 4, padding: "40px 32px" }}>
                        {children}
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style={{ padding: "24px 8px 0", fontSize: 13, lineHeight: "20px", color: palette.muted }}>
                        <p style={{ margin: "0 0 4px" }}>{brand.name}</p>
                        {(brand.phone || brand.email) && (
                          <p style={{ margin: "0 0 12px" }}>
                            {brand.phone && <span>{brand.phone}</span>}
                            {brand.phone && brand.email && <span> · </span>}
                            {brand.email && (
                              <a href={`mailto:${brand.email}`} style={{ color: palette.muted }}>
                                {brand.email}
                              </a>
                            )}
                          </p>
                        )}
                        <p style={{ margin: 0 }}>{reason}</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: "0 0 12px", fontSize: 12, lineHeight: "16px", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: palette.muted }}>
      {children}
    </p>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return <h1 style={{ margin: "0 0 20px", fontFamily: serif, fontWeight: 500, fontSize: 30, lineHeight: "38px", color: palette.navy }}>{children}</h1>;
}

export function Text({ children, muted = false, style }: { children: ReactNode; muted?: boolean; style?: CSSProperties }) {
  return <p style={{ margin: "0 0 16px", fontSize: 16, lineHeight: "26px", color: muted ? palette.muted : palette.navy, ...style }}>{children}</p>;
}

/** One primary action per email (DESIGN_SYSTEM.md "Restraint"): a navy button that is a plain link. */
export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "8px 0 24px" }}>
      <tbody>
        <tr>
          <td style={{ backgroundColor: palette.navy, borderRadius: 2 }}>
            <a
              href={href}
              style={{ display: "inline-block", padding: "14px 28px", fontSize: 15, lineHeight: "20px", fontWeight: 600, color: palette.ivory, textDecoration: "none" }}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function Rule() {
  return <div style={{ height: 1, backgroundColor: palette.border, margin: "24px 0" }} />;
}

export type DetailRow = { label: string; value: string };

/** Label/value pairs: booking code, journey, dates, travellers, amounts. */
export function Details({ rows }: { rows: DetailRow[] }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 24px", borderTop: `1px solid ${palette.border}` }}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${palette.border}`, fontSize: 14, lineHeight: "22px", color: palette.muted, verticalAlign: "top", width: "40%" }}>
              {row.label}
            </td>
            <td style={{ padding: "12px 0", borderBottom: `1px solid ${palette.border}`, fontSize: 14, lineHeight: "22px", color: palette.navy, verticalAlign: "top", fontWeight: 600 }}>
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Sign-off with the team name. */
export function SignOff({ closing, team }: { closing: string; team: string }) {
  return (
    <p style={{ margin: "8px 0 0", fontSize: 16, lineHeight: "26px", color: palette.navy }}>
      {closing}
      <br />
      {team}
    </p>
  );
}
