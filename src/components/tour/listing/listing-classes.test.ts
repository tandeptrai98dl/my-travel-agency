import { describe, expect, it } from "vitest";

import { buttonVariants } from "@/components/ui/button-variants";

import { GHOST_BUTTON, OUTLINE_BUTTON } from "./listing-classes";

describe("listing button classes", () => {
  it("equal buttonVariants()", () => {
    expect(OUTLINE_BUTTON).toBe(buttonVariants({ variant: "outline" }));
    expect(GHOST_BUTTON).toBe(buttonVariants({ variant: "ghost" }));
  });
});
