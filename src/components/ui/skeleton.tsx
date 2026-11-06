import { cn } from "@/lib/utils";

/** Loading placeholder; the pulse stops under prefers-reduced-motion (globals.css). */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-border/70", className)} {...props} />;
}

export { Skeleton };
