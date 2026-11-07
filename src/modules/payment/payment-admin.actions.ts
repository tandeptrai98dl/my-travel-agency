"use server";

import type { z } from "zod";

import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";
import type { Permission } from "@/lib/auth/permissions";

import { assignTransferSchema, manualPaymentSchema, type PaymentActionResult, refundSchema } from "./payment-admin.schemas";
import { assignTransfer, recordManualPayment, recordRefund } from "./payment-admin.service";

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

/** Accountant or admin at aal2 first, then Zod, then the service; the functions check again. */
async function guarded<S extends z.ZodType>(
  permission: Permission,
  schema: S,
  input: unknown,
  run: (values: z.output<S>) => Promise<PaymentActionResult>,
): Promise<PaymentActionResult> {
  try {
    await requirePermission(permission);
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid", fields: fieldErrors(parsed.error) };
    return await run(parsed.data);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}

export async function recordManualPaymentAction(input: unknown) {
  return guarded("payments.record", manualPaymentSchema, input, recordManualPayment);
}

export async function recordRefundAction(input: unknown) {
  return guarded("payments.refund", refundSchema, input, recordRefund);
}

export async function assignTransferAction(input: unknown) {
  return guarded("payments.record", assignTransferSchema, input, assignTransfer);
}
