"use server";

import type { z } from "zod";

import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";

import { changeStaffRoleSchema, inviteStaffSchema, setStaffActiveSchema } from "./staff.schemas";
import { changeStaffRole, inviteStaff, setStaffActive, type StaffResult } from "./staff.service";

export type StaffActionResult = StaffResult | { ok: false; error: string; fields: Record<string, string> };

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

/** Permission (admin at aal2) first, then Zod, then the service. */
async function guarded<S extends z.ZodType>(
  schema: S,
  input: unknown,
  run: (values: z.output<S>) => Promise<StaffResult>,
): Promise<StaffActionResult> {
  try {
    await requirePermission("staff.manage");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid", fields: fieldErrors(parsed.error) };
    return await run(parsed.data);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}

export async function inviteStaffAction(input: unknown) {
  return guarded(inviteStaffSchema, input, inviteStaff);
}

export async function changeStaffRoleAction(input: unknown) {
  return guarded(changeStaffRoleSchema, input, changeStaffRole);
}

export async function setStaffActiveAction(input: unknown) {
  return guarded(setStaffActiveSchema, input, setStaffActive);
}
