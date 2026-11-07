import { cva } from "class-variance-authority";
import { describe, expect, it } from "vitest";

import { BUTTON_SIZES, BUTTON_VARIANTS, buttonVariants } from "./button-variants";

// The cva definition the plain function replaced; both must give the same classes.
const reference = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-small font-medium tracking-wide transition-colors duration-200 ease-luxe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
  variants: { variant: BUTTON_VARIANTS, size: BUTTON_SIZES },
  compoundVariants: [{ variant: "link", class: "inline h-auto whitespace-normal px-0" }],
  defaultVariants: { variant: "default", size: "default" },
  },
);

describe("buttonVariants", () => {
  it("matches class-variance-authority for every variant and size", () => {
    for (const variant of [undefined, ...Object.keys(BUTTON_VARIANTS)] as (keyof typeof BUTTON_VARIANTS | undefined)[]) {
      for (const size of [undefined, ...Object.keys(BUTTON_SIZES)] as (keyof typeof BUTTON_SIZES | undefined)[]) {
        expect(buttonVariants({ variant, size, className: "extra" })).toBe(reference({ variant, size, className: "extra" }));
      }
    }
    expect(buttonVariants()).toBe(reference());
  });
});
