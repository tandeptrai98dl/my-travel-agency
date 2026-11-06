"use server";

import type { z } from "zod";

import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";

import { saveSettings, type SaveSettingsResult } from "./settings-admin.service";
import { saveSettingsSchema } from "./settings.schemas";

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    // Paths start with "value": the form names fields from inside its section.
    const path = issue.path.slice(1).join(".");
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

/** Permission (admin at aal2) first, then Zod, then the service. */
export async function saveSettingsAction(
  input: unknown,
): Promise<SaveSettingsResult | { ok: false; error: string; fields: Record<string, string> }> {
  try {
    await requirePermission("settings.manage");
    const parsed = saveSettingsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid", fields: fieldErrors(parsed.error) };
    return await saveSettings(parsed.data);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}
