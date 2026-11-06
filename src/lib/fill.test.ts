import { describe, expect, it } from "vitest";

import { fill } from "./fill";

describe("fill", () => {
  it("replaces known placeholders and keeps unknown ones", () => {
    expect(fill("Đang tải {name}…", { name: "vinh.jpg" })).toBe("Đang tải vinh.jpg…");
    expect(fill("{a} và {b}", { a: 1 })).toBe("1 và {b}");
  });
});
