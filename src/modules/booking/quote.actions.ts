"use server";

import type { z } from "zod";

import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";
import type { Permission } from "@/lib/auth/permissions";

import { createPaymentLinkSchema, createQuoteSchema } from "./quote.schemas";
import { createPaymentLink, createQuote } from "./quote.service";

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

async function guarded<S extends z.ZodType, R>(permission: Permission, schema: S, input: unknown, run: (values: z.output<S>) => Promise<R>) {
  try {
    await requirePermission(permission);
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: "invalid", fields: fieldErrors(parsed.error) };
    return await run(parsed.data);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false as const, error: "forbidden" };
    throw error;
  }
}

export async function createQuoteAction(input: unknown) {
  return guarded("bookings.edit", createQuoteSchema, input, createQuote);
}

export async function createPaymentLinkAction(input: unknown) {
  return guarded("bookings.send_payment_link", createPaymentLinkSchema, input, createPaymentLink);
}
