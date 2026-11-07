/**
 * Every gateway implements PaymentProvider (ARCHITECTURE.md "Payment adapter",
 * docs/specs/phase-4-booking-payments.md decision 6). Adapters are pure: they build requests and
 * verify what gateways send; the payment service records results through record_payment_event().
 */

export type PaymentToStart = {
  reference: string;
  amount: number;
  expiresAt: Date;
  bookingCode: string;
  locale: "vi" | "en";
  /** The customer's IP (VNPay asks for it). */
  ipAddress: string;
};

export type PaymentInstructions =
  | { kind: "redirect"; url: string }
  | { kind: "transfer"; payload: string; bankBin: string; bankName: string; accountNumber: string; accountHolder: string; amount: number; memo: string };

/** A verified gateway result, ready for record_payment_event(). */
export type GatewayEvent = {
  eventKey: string;
  reference: string;
  amount: number;
  providerTxnId: string | null;
  succeeded: boolean;
  payload: Record<string, unknown>;
};

export interface PaymentProvider {
  readonly id: "vnpay" | "bank_transfer";
  createPayment(payment: PaymentToStart): PaymentInstructions;
  /** The browser return: display only, never confirms (brief §6). */
  verifyReturn?(params: URLSearchParams): { valid: boolean; reference: string | null; succeeded: boolean };
  refund?(): never;
}
