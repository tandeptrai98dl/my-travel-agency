import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { loadMessages } from "@/i18n/messages";
import { isLocale, routing } from "@/i18n/routing";
import { getPublicSettings } from "@/modules/settings/settings.service";

/**
 * Generated Open Graph image for pages without a photo of their own (home, listing, search,
 * policies; Phase 3 spec decision 11, ADR-028): the brand name from settings in Cormorant Garamond
 * on navy with a gold rule and the tagline. Generated per locale at build time and refreshed with
 * the settings. Pages with a photo set their own `openGraph.images`.
 *
 * Fonts: Cormorant Garamond 500 and Be Vietnam Pro 400, Latin and Vietnamese WOFF subsets from the
 * fonts' `@fontsource` packages (`next/og` does not read WOFF2), committed under `src/assets/fonts`
 * with their SIL Open Font License 1.1 texts.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FONT_DIR = join(process.cwd(), "src/assets/fonts");
const font = (file: string) => readFile(join(FONT_DIR, file));

/** Plain strings from the message files (image routes do not run next-intl's server helpers). */
async function strings(locale: "vi" | "en") {
  const messages = (await loadMessages(locale)) as { Metadata: { siteName: string }; Home: { metaTitle: string } };
  return { siteName: messages.Metadata.siteName, tagline: messages.Home.metaTitle };
}

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const raw = (await params).locale;
  const locale = isLocale(raw) ? raw : routing.defaultLocale;
  const [settings, text, serifLatin, serifVi, sansLatin, sansVi] = await Promise.all([
    getPublicSettings(),
    strings(locale),
    font("cormorant-garamond-latin-500-normal.woff"),
    font("cormorant-garamond-vietnamese-500-normal.woff"),
    font("be-vietnam-pro-latin-400-normal.woff"),
    font("be-vietnam-pro-vietnamese-400-normal.woff"),
  ]);
  const brand = settings.company?.name ?? text.siteName;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#0F1B2D",
          color: "#F7F3EC",
        }}
      >
        <div style={{ fontFamily: "SerifLatin, SerifVietnamese", fontSize: 96, lineHeight: 1.15 }}>{brand}</div>
        <div style={{ width: 96, height: 2, background: "#C9A96E", margin: "40px 0" }} />
        <div style={{ fontFamily: "SansLatin, SansVietnamese", fontSize: 32, lineHeight: 1.4, color: "#B9B4AA", maxWidth: 900 }}>
          {text.tagline}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        // One name per subset: the renderer falls back along the family list glyph by glyph.
        { name: "SerifLatin", data: serifLatin, weight: 500, style: "normal" },
        { name: "SerifVietnamese", data: serifVi, weight: 500, style: "normal" },
        { name: "SansLatin", data: sansLatin, weight: 400, style: "normal" },
        { name: "SansVietnamese", data: sansVi, weight: 400, style: "normal" },
      ],
    },
  );
}
