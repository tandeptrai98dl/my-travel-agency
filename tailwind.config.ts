import tailwindcssAnimate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

/** Design tokens: DESIGN_SYSTEM.md, values in src/app/globals.css (ADR-021). */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        destructive: { DEFAULT: token("destructive"), foreground: token("destructive-foreground") },
        success: { DEFAULT: token("success"), foreground: token("success-foreground") },
        warning: { DEFAULT: token("warning"), foreground: token("warning-foreground") },
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        // Brand colours for decoration and navy sections.
        gold: token("gold"),
        navy: token("navy"),
        ivory: token("ivory"),
        "warm-gray": token("warm-gray"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
      },
      // Type scale (DESIGN_SYSTEM.md "Typography"); mobile sizes first, `md:` for desktop. Heading
      // line-heights stay >= 1.15 so stacked Vietnamese diacritics are never clipped.
      fontSize: {
        display: ["2.75rem", { lineHeight: "3.25rem" }],
        "display-lg": ["4.5rem", { lineHeight: "5.25rem" }],
        h1: ["2.375rem", { lineHeight: "2.875rem" }],
        "h1-lg": ["3.5rem", { lineHeight: "4.125rem" }],
        h2: ["1.875rem", { lineHeight: "2.375rem" }],
        "h2-lg": ["2.5rem", { lineHeight: "3rem" }],
        h3: ["1.5rem", { lineHeight: "2rem" }],
        "h3-lg": ["1.75rem", { lineHeight: "2.25rem" }],
        h4: ["1.125rem", { lineHeight: "1.625rem" }],
        "h4-lg": ["1.25rem", { lineHeight: "1.75rem" }],
        "body-lg": ["1.0625rem", { lineHeight: "1.75rem" }],
        "body-lg-lg": ["1.125rem", { lineHeight: "1.875rem" }],
        body: ["1rem", { lineHeight: "1.625rem" }],
        small: ["0.875rem", { lineHeight: "1.375rem" }],
        eyebrow: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.2em" }],
      },
      maxWidth: { prose: "680px" },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 2px)",
      },
      transitionTimingFunction: { luxe: "var(--ease-luxe)" },
      transitionDuration: { 400: "400ms", 600: "600ms", 800: "800ms" },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
