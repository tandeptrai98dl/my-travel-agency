import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

// DESIGN_SYSTEM.md type scale. Visual size is independent of the HTML level, so the outline
// stays correct (one h1 per page) whatever the design calls for.
const headingVariants = cva("text-balance text-foreground", {
  variants: {
    size: {
      display: "font-serif text-display font-medium md:text-display-lg",
      h1: "font-serif text-h1 font-medium md:text-h1-lg",
      h2: "font-serif text-h2 font-medium md:text-h2-lg",
      h3: "font-serif text-h3 font-semibold md:text-h3-lg",
      h4: "font-sans text-h4 font-semibold md:text-h4-lg",
    },
  },
  defaultVariants: { size: "h2" },
});

type Level = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  level: Level;
}

export function Heading({ level, size, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as const;
  return <Tag className={cn(headingVariants({ size }), className)} {...props} />;
}

export { headingVariants };
