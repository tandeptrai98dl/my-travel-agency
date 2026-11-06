import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The design-system font sizes (tailwind.config.ts) look like colour utilities to
// tailwind-merge (`text-h1`, `text-display`…). Without this, `cn("text-h1 text-foreground")`
// would drop the colour.
const FONT_SIZES = [
  "display",
  "display-lg",
  "h1",
  "h1-lg",
  "h2",
  "h2-lg",
  "h3",
  "h3-lg",
  "h4",
  "h4-lg",
  "body-lg",
  "body-lg-lg",
  "body",
  "small",
  "eyebrow",
];

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: FONT_SIZES }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
