import * as React from "react";

import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  /** Optional icon (lucide-react); decorative. */
  icon?: React.ReactNode;
  /** Usually one button or link: the single next step (DESIGN_SYSTEM.md "one primary action"). */
  action?: React.ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
};

/** Shown when a list has nothing to show: no tours match the filters, no bookings yet. */
function EmptyState({ title, description, icon, action, className, headingLevel = 2 }: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-6 py-16 text-center",
        className,
      )}
    >
      {icon && (
        <span aria-hidden="true" className="text-gold [&_svg]:h-8 [&_svg]:w-8">
          {icon}
        </span>
      )}
      <Heading className="font-serif text-h3 font-semibold">{title}</Heading>
      {description && <p className="max-w-md text-body text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export { EmptyState };
