import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps design-system font sizes and text colours side by side", () => {
    expect(cn("text-h1 text-foreground")).toBe("text-h1 text-foreground");
    expect(cn("text-display md:text-display-lg text-muted-foreground")).toBe(
      "text-display md:text-display-lg text-muted-foreground",
    );
  });

  it("still lets a later font size or colour win", () => {
    expect(cn("text-h1", "text-h2")).toBe("text-h2");
    expect(cn("text-foreground", "text-muted-foreground")).toBe("text-muted-foreground");
  });
});
