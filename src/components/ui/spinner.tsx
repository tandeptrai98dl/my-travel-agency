import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = { label: string; className?: string };

/** Indeterminate progress with an accessible label (passed in translated). */
function Spinner({ label, className }: Props) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2", className)}>
      <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export { Spinner };
