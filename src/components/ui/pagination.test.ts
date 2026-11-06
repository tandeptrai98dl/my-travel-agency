import { describe, expect, it } from "vitest";

import { paginationRange } from "./pagination";

describe("paginationRange", () => {
  it("handles empty and single-page results", () => {
    expect(paginationRange(1, 0)).toEqual([]);
    expect(paginationRange(1, 1)).toEqual([1]);
  });

  it("shows every page when there are few", () => {
    expect(paginationRange(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("collapses long gaps and never hides a single page behind an ellipsis", () => {
    expect(paginationRange(1, 10)).toEqual([1, 2, "ellipsis", 10]);
    expect(paginationRange(5, 10)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
    expect(paginationRange(4, 10)).toEqual([1, 2, 3, 4, 5, "ellipsis", 10]);
    expect(paginationRange(10, 10)).toEqual([1, "ellipsis", 9, 10]);
  });

  it("clamps out-of-range pages", () => {
    expect(paginationRange(99, 4)).toEqual([1, 2, 3, 4]);
    expect(paginationRange(-3, 10)).toEqual([1, 2, "ellipsis", 10]);
  });
});
