"use server";

import type { z } from "zod";

import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";
import type { Permission } from "@/lib/auth/permissions";

import {
  type CustomerActionResult,
  type CustomerExportResult,
  customerIdSchema,
  customerNoteSchema,
  finishDeletionSchema,
} from "./customers-admin.schemas";
import { addCustomerNote, exportCustomerData, finishCustomerDeletion } from "./customers-admin.service";

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
  run: (values: z.output<S>) => Promise<CustomerActionResult>,
): Promise<CustomerActionResult> {
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

export async function addCustomerNoteAction(input: unknown) {
  return guarded("customers.notes", customerNoteSchema, input, addCustomerNote);
}

export async function finishCustomerDeletionAction(input: unknown) {
  return guarded("customers.delete_data", finishDeletionSchema, input, finishCustomerDeletion);
}

export async function exportCustomerDataAction(input: unknown): Promise<CustomerExportResult> {
  try {
    await requirePermission("customers.delete_data");
    const parsed = customerIdSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "not_found" };
    return await exportCustomerData(parsed.data.customerId);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}
