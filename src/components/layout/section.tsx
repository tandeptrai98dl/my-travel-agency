import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

import { Container } from "./container";

const sectionVariants = cva("", {
  variants: {
    tone: {
      ivory: "bg-background text-foreground",
      white: "bg-card text-card-foreground",
      // Re-maps every token for navy sections (globals.css `.theme-navy`).
      navy: "theme-navy bg-background text-foreground",
    },
    spacing: {
      default: "py-16 md:py-28",
      editorial: "py-20 md:py-40",
      compact: "py-10 md:py-16",
      none: "",
    },
  },
  defaultVariants: { tone: "ivory", spacing: "default" },
});

export interface SectionProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof sectionVariants> {
  /** Set to false for full-bleed content (heroes, galleries). */
  contained?: boolean;
}

export function Section({ tone, spacing, contained = true, className, children, ...props }: SectionProps) {
  return (
    <section className={cn(sectionVariants({ tone, spacing }), className)} {...props}>
      {contained ? <Container>{children}</Container> : children}
    </section>
  );
}
