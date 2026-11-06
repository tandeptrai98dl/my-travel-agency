import { describe, expect, it } from "vitest";

import { assertDong, formatVnd, InvalidAmountError, percentOf, sum, times } from "./money";

const NBSP = / /g;

describe("money (ADR-011)", () => {
  it("accepts whole dong only", () => {
    expect(assertDong(12_900_000)).toBe(12_900_000);
    expect(() => assertDong(1.5)).toThrow(InvalidAmountError);
    expect(() => assertDong(Number.NaN)).toThrow(InvalidAmountError);
    expect(() => assertDong(2 ** 53)).toThrow(InvalidAmountError);
  });

  it("sums and multiplies", () => {
    expect(sum([12_900_000, 9_675_000, -1_000_000])).toBe(21_575_000);
    expect(times(12_900_000, 2)).toBe(25_800_000);
    expect(() => times(12_900_000, 1.5)).toThrow(InvalidAmountError);
  });

  it("takes percentages with half-up rounding to the dong", () => {
    expect(percentOf(12_900_000, 30)).toBe(3_870_000);
    expect(percentOf(999, 30)).toBe(300); // 299.7
    expect(percentOf(5, 50)).toBe(3); // 2.5 rounds up
    expect(percentOf(4, 50)).toBe(2);
    expect(percentOf(135_000_000, 0)).toBe(0);
    expect(percentOf(135_000_000, 100)).toBe(135_000_000);
    expect(() => percentOf(1_000, 101)).toThrow(InvalidAmountError);
    expect(() => percentOf(1_000, 12.5)).toThrow(InvalidAmountError);
  });

  it("formats VND per locale", () => {
    expect(formatVnd(12_900_000, "vi").replace(NBSP, " ")).toBe("12.900.000 ₫");
    expect(formatVnd(12_900_000, "en").replace(NBSP, " ")).toBe("₫12,900,000");
    expect(() => formatVnd(1.5, "vi")).toThrow(InvalidAmountError);
  });
});
