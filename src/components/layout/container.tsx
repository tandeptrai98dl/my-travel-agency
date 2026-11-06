import * as React from "react";

import { cn } from "@/lib/utils";

/** Page-width container: max 1280 px with 16/32 px gutters (DESIGN_SYSTEM.md "Layout"). */
export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 md:px-8", className)} {...props} />;
}
