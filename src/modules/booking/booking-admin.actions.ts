"use server";

import type { z } from "zod";

import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";
import type { Permission } from "@/lib/auth/permissions";

import { type BookingActionResult, bookingNoteSchema, updateContactSchema } from "./booking-admin.schemas";
import { cancelBooking, requestCancellation, resolveAttention, updateContact } from "./booking-admin.service";

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

/** Permission first, then Zod, then the service (which checks again; RLS and the functions too). */
async function guarded<S extends z.ZodType>(
  permission: Permission,
  schema: S,
  input: unknown,
  run: (values: z.output<S>) => Promise<BookingActionResult>,
): Promise<BookingActionResult> {
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

export async function cancelBookingAction(input: unknown) {
  return guarded("bookings.change_status", bookingNoteSchema, input, cancelBooking);
}

export async function requestCancellationAction(input: unknown) {
  return guarded("bookings.request_cancellation", bookingNoteSchema, input, requestCancellation);
}

export async function resolveAttentionAction(input: unknown) {
  return guarded("bookings.resolve_attention", bookingNoteSchema, input, resolveAttention);
}

export async function updateContactAction(input: unknown) {
  return guarded("bookings.edit", updateContactSchema, input, updateContact);
}
