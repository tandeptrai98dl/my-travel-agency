// Kept apart from the Button component so the public shell can style a plain <button> without
// pulling Radix Slot and tailwind-merge into the initial JavaScript (Phase 3 spec decision 16).
// Plain maps rather than class-variance-authority, whose runtime (with clsx) would otherwise be
// copied into each public page chunk that styles a button; the output is the same (unit-tested).
// DESIGN_SYSTEM.md: sharp corners (2px), no shadows, 200 ms transitions, 44 px touch targets.

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-small font-medium tracking-wide transition-colors duration-200 ease-luxe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0";

export const BUTTON_VARIANTS = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  gold: "bg-accent text-accent-foreground hover:bg-accent/85",
  secondary: "border border-border bg-card text-foreground hover:border-input",
  outline: "border border-primary bg-transparent text-foreground hover:bg-primary hover:text-primary-foreground",
  ghost: "text-foreground hover:bg-secondary",
  link: "text-foreground underline decoration-gold decoration-1 underline-offset-[6px] hover:decoration-2",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
} as const;

export const BUTTON_SIZES = {
  sm: "h-9 px-4",
  default: "h-11 px-6",
  lg: "h-12 px-8 text-body",
  icon: "h-11 w-11",
} as const;

export type ButtonVariantProps = {
  variant?: keyof typeof BUTTON_VARIANTS | null;
  size?: keyof typeof BUTTON_SIZES | null;
};

/** Classes of a button: base, variant, size, then the link override (it wins over sizes). */
export function buttonVariants({ variant, size, className }: ButtonVariantProps & { className?: string } = {}): string {
  const v = variant ?? "default";
  const parts = [BASE, BUTTON_VARIANTS[v], BUTTON_SIZES[size ?? "default"]];
  if (v === "link") parts.push("inline h-auto whitespace-normal px-0");
  if (className) parts.push(className);
  return parts.join(" ");
}
