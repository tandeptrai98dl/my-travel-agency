import { z } from "zod";

import type { Database } from "@/types/database.types";

// Messages are keys in `Admin.Bookings.errors`.

type Enums = Database["public"]["Enums"];

export const PAYMENT_SORTS = ["created_at", "amount", "paid_at"] as const;
export type PaymentSort = (typeof PAYMENT_SORTS)[number];

export const LEDGER_PROVIDERS = ["vnpay", "bank_transfer", "cash", "manual"] as const satisfies readonly Enums["payment_provider"][];
export const TRANSACTION_STATUSES = [
  "pending",
  "succeeded",
  "failed",
  "expired",
  "cancelled",
] as const satisfies readonly Enums["transaction_status"][];
export const PAYMENT_KINDS = ["deposit", "balance", "full", "refund"] as const satisfies readonly Enums["payment_kind"][];

/** Money staff record by hand (spec decision 4): never a gateway the customer paid through. */
export const MANUAL_METHODS = ["cash", "bank_transfer", "manual"] as const;
/** A refund is paid back outside the system; a VNPay refund is made in VNPay's portal first. */
export const REFUND_METHODS = ["bank_transfer", "cash", "vnpay", "manual"] as const;

const note = z.string().trim().min(3, "noteRequired").max(500, "tooLong");
// MoneyInput sends whole dong; the functions cap refunds at what was received.
const amount = z.number("amountInvalid").int("amountInvalid").positive("amountInvalid").max(10_000_000_000, "amountInvalid");

export const manualPaymentSchema = z.object({
  bookingId: z.uuid(),
  amount,
  method: z.enum(MANUAL_METHODS, "methodInvalid"),
  note,
});
export type ManualPaymentInput = z.input<typeof manualPaymentSchema>;
export type ManualPaymentValues = z.output<typeof manualPaymentSchema>;

export const refundSchema = z.object({
  bookingId: z.uuid(),
  amount,
  method: z.enum(REFUND_METHODS, "methodInvalid"),
  note,
});
export type RefundInput = z.input<typeof refundSchema>;
export type RefundValues = z.output<typeof refundSchema>;

export const BOOKING_CODE = /^PTA-\d{4}-\d{4,}$/;

export const assignTransferSchema = z.object({
  eventId: z.uuid(),
  bookingCode: z.string().trim().toUpperCase().regex(BOOKING_CODE, "bookingCodeInvalid"),
  note,
});
export type AssignTransferInput = z.input<typeof assignTransferSchema>;
export type AssignTransferValues = z.output<typeof assignTransferSchema>;

export type LedgerRow = {
  id: string;
  createdAt: string;
  paidAt: string | null;
  provider: Enums["payment_provider"];
  kind: Enums["payment_kind"];
  status: Enums["transaction_status"];
  amount: number;
  reference: string;
  bookingId: string;
  bookingCode: string;
  note: string | null;
  recordedBy: string | null;
};

export type UnmatchedTransfer = {
  id: string;
  receivedAt: string;
  amount: number | null;
  memo: string;
  eventKey: string;
};

export type PaymentActionError =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "note_required"
  | "refund_too_large"
  | "invalid_amount"
  | "not_payable"
  | "not_unmatched"
  | "retry"
  | "failed";

export type PaymentActionResult =
  | { ok: true; status?: string; reference?: string }
  | { ok: false; error: PaymentActionError; fields?: Record<string, string> };

/** Maps an error raised by the payment functions to a message key. */
export function paymentErrorCode(error: { code?: string; message?: string } | null): PaymentActionError {
  if (!error) return "failed";
  if (error.code === "42501") return "forbidden";
  if (error.code === "P0002") return "not_found";
  if (error.code === "40P01" || error.code === "40001") return "retry";
  const known = ["note_required", "refund_too_large", "invalid_amount", "not_payable", "not_unmatched"] as const;
  return known.find((key) => error.message === key) ?? "failed";
}

/** What a stored bank webhook says about the credit (payload as normalised by the adapter). */
export function transferFromPayload(payload: unknown): { amount: number | null; memo: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { amount: null, memo: "" };
  const value = payload as Record<string, unknown>;
  const raw = value.transferAmount ?? value.amount;
  const amount = typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  const memo = [value.content, value.description].filter((part): part is string => typeof part === "string").join(" ").trim();
  return { amount, memo: memo.slice(0, 300) };
}
