import * as React from "react";

import { cn } from "@/lib/utils";

import { Button, type ButtonProps } from "./button";

export interface IconButtonProps extends Omit<ButtonProps, "size" | "children" | "aria-label"> {
  /** Accessible name, already translated. Icon-only buttons must always have one (WCAG 4.1.2). */
  label: string;
  /** The icon (lucide-react, `strokeWidth={1.5}`); hidden from assistive technology. */
  icon: React.ReactNode;
  size?: "sm" | "default";
}

/** A square button with only an icon: 44 px by default, 36 px small (DESIGN_SYSTEM.md). */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, icon, size = "default", variant = "ghost", className, ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      size="icon"
      aria-label={label}
      className={cn(size === "sm" && "h-9 w-9", className)}
      {...props}
    >
      <span aria-hidden="true" className="contents">
        {icon}
      </span>
    </Button>
  ),
);
IconButton.displayName = "IconButton";

export { IconButton };
