import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

type TagProps = React.HTMLAttributes<HTMLSpanElement> &
  (
    | {
        /** Shows a remove button; `removeLabel` is its required name ("Remove Hạ Long"). */
        onRemove: () => void;
        removeLabel: string;
      }
    | { onRemove?: never; removeLabel?: never }
  );

/**
 * Quiet label for filters and taxonomy (destinations, travel styles). Unlike `Badge` it uses
 * sentence case and can be removed, e.g. active filters on the tour listing.
 */
function Tag({ className, children, onRemove, removeLabel, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1 rounded-sm border border-border bg-card px-3 text-small text-foreground",
        onRemove && "pr-1",
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

export { Tag };
export type { TagProps };
