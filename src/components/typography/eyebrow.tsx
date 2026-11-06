import * as React from "react";

import { cn } from "@/lib/utils";

/** Small uppercase, letter-spaced label above headings. Gold only inside navy sections. */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "font-sans text-eyebrow font-semibold uppercase text-muted-foreground [.theme-navy_&]:text-gold",
        className,
      )}
      {...props}
    />
  );
}
