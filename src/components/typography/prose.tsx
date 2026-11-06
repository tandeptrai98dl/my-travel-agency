import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Long-form text block (680 px measure, editorial rhythm). Rich text (Tiptap JSON) is rendered
 * into it by `RichText` (`./rich-text.tsx`) through a node whitelist (ARCHITECTURE.md "Security").
 */
export function Prose({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "max-w-prose text-body-lg text-foreground md:text-body-lg-lg",
        "[&_a]:underline [&_a]:decoration-gold [&_a]:underline-offset-4",
        "[&_h2]:mt-12 [&_h2]:font-serif [&_h2]:text-h2 [&_h2]:font-medium md:[&_h2]:text-h2-lg",
        "[&_h3]:mt-8 [&_h3]:font-serif [&_h3]:text-h3 [&_h3]:font-semibold",
        "[&_li]:mt-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-6 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_blockquote]:mt-8 [&_blockquote]:border-l-2 [&_blockquote]:border-gold [&_blockquote]:pl-6 [&_blockquote]:italic",
        "[&_figure]:mt-10",
        "[&>*:first-child]:mt-0",
        className,
      )}
      {...props}
    />
  );
}
