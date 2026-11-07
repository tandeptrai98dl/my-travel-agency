"use server";

import type { z } from "zod";

import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";

import { type InquiryActionResult, inquiryAssignSchema, inquiryNoteSchema, inquiryStatusSchema } from "./inquiry-admin.schemas";
import { addInquiryNote, assignInquiry, updateInquiryStatus } from "./inquiry-admin.service";

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

/** Permission first, then Zod, then the service (which checks again; the functions and RLS too). */
async function guarded<S extends z.ZodType>(schema: S, input: unknown, run: (values: z.output<S>) => Promise<InquiryActionResult>): Promise<InquiryActionResult> {
  try {
    await requirePermission("inquiries.edit");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid", fields: fieldErrors(parsed.error) };
    return await run(parsed.data);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}

export async function assignInquiryAction(input: unknown) {
  return guarded(inquiryAssignSchema, input, assignInquiry);
}

export async function updateInquiryStatusAction(input: unknown) {
  return guarded(inquiryStatusSchema, input, updateInquiryStatus);
}

export async function addInquiryNoteAction(input: unknown) {
  return guarded(inquiryNoteSchema, input, addInquiryNote);
}
