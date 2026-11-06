/**
 * Money is integer dong (ADR-011): `bigint` in Postgres, `number` in TypeScript. Every helper
 * rejects non-integer and unsafe values so float arithmetic can never creep into prices.
 */

export type Dong = number;

export class InvalidAmountError extends Error {
  constructor(value: unknown) {
    super(`Not a whole number of dong: ${String(value)}`);
    this.name = "InvalidAmountError";
  }
}

export function assertDong(value: number): Dong {
  if (!Number.isSafeInteger(value)) throw new InvalidAmountError(value);
  return value;
}

export function sum(amounts: readonly Dong[]): Dong {
  return amounts.reduce((total, amount) => assertDong(total + assertDong(amount)), 0);
}

/** Unit price × quantity (quantity must be a whole number). */
export function times(unitPrice: Dong, quantity: number): Dong {
  if (!Number.isSafeInteger(quantity)) throw new InvalidAmountError(quantity);
  return assertDong(assertDong(unitPrice) * quantity);
}

/**
 * `percent` % of an amount, rounded to the nearest dong with halves away from zero (deposits,
 * refunds), which matches Postgres `round(numeric)`. Integer arithmetic only; amount × percent
 * must stay a safe integer.
 */
export function percentOf(amount: Dong, percent: number): Dong {
  assertDong(amount);
  if (!Number.isSafeInteger(percent) || percent < 0 || percent > 100) {
    throw new InvalidAmountError(percent);
  }
  const scaled = assertDong(amount * percent);
  const quotient = Math.trunc(scaled / 100);
  const remainder = scaled - quotient * 100;
  if (remainder >= 50) return quotient + 1;
  if (remainder <= -50) return quotient - 1;
  return quotient;
}

const formatters: Record<"vi" | "en", Intl.NumberFormat> = {
  vi: new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }),
  en: new Intl.NumberFormat("en-GB", { style: "currency", currency: "VND", maximumFractionDigits: 0 }),
};

/** "12.900.000 ₫" (vi) or "₫12,900,000" (en). Prices are charged and shown in VND (ADR-006). */
export function formatVnd(amount: Dong, locale: "vi" | "en"): string {
  return formatters[locale].format(assertDong(amount));
}
