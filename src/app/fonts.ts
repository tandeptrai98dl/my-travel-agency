import { Be_Vietnam_Pro, Cormorant_Garamond } from "next/font/google";

// Design-system fonts (ADR-021), self-hosted by next/font with the Vietnamese subset so stacked
// diacritics (ặ, ẫ, ỡ) render in the brand faces.
const serif = Cormorant_Garamond({
  variable: "--font-serif",
  weight: ["500", "600"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const sans = Be_Vietnam_Pro({
  variable: "--font-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

/** Put on <html> in every root layout; `body` uses `font-sans` from globals.css. */
export const fontVariables = `${serif.variable} ${sans.variable}`;
