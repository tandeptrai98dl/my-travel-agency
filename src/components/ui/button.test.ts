import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

import { buttonVariants } from "./button";

// What <Button> renders: cva output merged by cn().
const rendered = (props: Parameters<typeof buttonVariants>[0]) => cn(buttonVariants(props)).split(" ");

describe("buttonVariants", () => {
  it("lets link buttons sit inline with text (no height or side padding)", () => {
    const classes = rendered({ variant: "link" });
    expect(classes).toContain("h-auto");
    expect(classes).toContain("px-0");
    expect(classes).not.toContain("h-11");
    expect(classes).not.toContain("px-6");
  });

  it("keeps 44 px touch targets for the default size", () => {
    expect(rendered({})).toContain("h-11");
  });
});
