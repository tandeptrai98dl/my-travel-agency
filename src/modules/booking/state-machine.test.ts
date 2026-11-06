import { describe, expect, it } from "vitest";

import { canCancel, canStartPayment, canTransition, paymentStateFor, TRANSITIONS } from "./state-machine";

describe("booking state machine", () => {
  it("follows the lifecycle", () => {
    expect(canTransition("draft", "pending_payment")).toBe(true);
    expect(canTransition("quoted", "pending_payment")).toBe(true);
    expect(canTransition("pending_payment", "confirmed")).toBe(true);
    expect(canTransition("pending_payment", "expired")).toBe(true);
    expect(canTransition("expired", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "completed")).toBe(true);
    expect(canTransition("draft", "confirmed")).toBe(false);
    expect(canTransition("expired", "pending_payment")).toBe(false);
    expect(canTransition("completed", "cancelled")).toBe(false);
    expect(TRANSITIONS.cancelled).toEqual([]);
  });

  it("knows when payments and cancellations are allowed", () => {
    expect(canStartPayment("draft", "unpaid")).toBe(true);
    expect(canStartPayment("confirmed", "deposit_paid")).toBe(true);
    expect(canStartPayment("confirmed", "paid")).toBe(false);
    expect(canStartPayment("expired", "unpaid")).toBe(false);
    expect(canCancel("confirmed")).toBe(true);
    expect(canCancel("completed")).toBe(false);
  });

  it("derives the payment state from the money", () => {
    expect(paymentStateFor({ amountPaid: 0, total: 100, deposit: 30, refunded: 0 })).toBe("unpaid");
    expect(paymentStateFor({ amountPaid: 30, total: 100, deposit: 30, refunded: 0 })).toBe("deposit_paid");
    expect(paymentStateFor({ amountPaid: 20, total: 100, deposit: 30, refunded: 0 })).toBe("unpaid");
    expect(paymentStateFor({ amountPaid: 100, total: 100, deposit: 30, refunded: 0 })).toBe("paid");
    expect(paymentStateFor({ amountPaid: 40, total: 100, deposit: 30, refunded: 60 })).toBe("partially_refunded");
    expect(paymentStateFor({ amountPaid: 0, total: 100, deposit: 30, refunded: 100 })).toBe("refunded");
  });
});
