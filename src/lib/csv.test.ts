import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes cells and doubles quotes", () => {
    expect(csvCell('Nhà "Hoa"')).toBe('"Nhà ""Hoa"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
  });

  it("neutralises formulas", () => {
    for (const value of ["=HYPERLINK(\"x\")", "+1", "-2", "@SUM(A1)", "\tx", "\rx"]) {
      expect(csvCell(value).startsWith(`"'`), value).toBe(true);
    }
    expect(csvCell("a@b.c")).toBe('"a@b.c"');
  });

  it("joins rows with CRLF", () => {
    expect(toCsv(["email"], [["a@b.c"], ["d@e.f"]])).toBe('"email"\r\n"a@b.c"\r\n"d@e.f"\r\n');
  });
});
