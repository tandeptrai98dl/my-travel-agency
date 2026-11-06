import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-small [&>svg+div]:translate-y-[-2px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3.5 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground [&>svg]:text-foreground",
        success: "border-success/40 bg-card text-card-foreground [&>svg]:text-success",
        warning: "border-warning/40 bg-card text-card-foreground [&>svg]:text-warning",
        destructive: "border-destructive/50 bg-card text-card-foreground [&>svg]:text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & {
    /**
     * Announce the alert when it appears: "polite" for confirmations, "assertive" for errors the
     * user must act on now. Static notices ("Almost full" on a tour page) leave it unset.
     */
    live?: "polite" | "assertive";
  };

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(({ className, variant, live, ...props }, ref) => (
  <div
    ref={ref}
    role={live === "assertive" ? "alert" : live === "polite" ? "status" : undefined}
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

/** A paragraph, not a heading, so alerts never break the page's heading order. */
const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("mb-1 font-semibold leading-snug", className)} {...props} />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-muted-foreground [&_p]:leading-relaxed", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertDescription, AlertTitle };
