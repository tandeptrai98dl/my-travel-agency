import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

// DESIGN_SYSTEM.md: sharp corners (2px), no shadows, 200 ms transitions, 44 px touch targets.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-small font-medium tracking-wide transition-colors duration-200 ease-luxe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        gold: "bg-accent text-accent-foreground hover:bg-accent/85",
        secondary: "border border-border bg-card text-foreground hover:border-input",
        outline:
          "border border-primary bg-transparent text-foreground hover:bg-primary hover:text-primary-foreground",
        ghost: "text-foreground hover:bg-secondary",
        link: "text-foreground underline decoration-gold decoration-1 underline-offset-[6px] hover:decoration-2",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        sm: "h-9 px-4",
        default: "h-11 px-6",
        lg: "h-12 px-8 text-body",
        icon: "h-11 w-11",
      },
    },
    // Compound variants come after sizes, so they win: link buttons sit inline with text.
    compoundVariants: [{ variant: "link", class: "inline h-auto whitespace-normal px-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
