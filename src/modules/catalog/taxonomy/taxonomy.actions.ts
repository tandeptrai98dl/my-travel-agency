"use server";

import type { z } from "zod";

import type { Permission } from "@/lib/auth/permissions";
import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";

import {
  cancellationPolicySchema,
  destinationSchema,
  idSchema,
  slugCheckSchema,
  travelStyleSchema,
} from "./taxonomy.schemas";
import * as service from "./taxonomy.service";

export type FieldErrors = Record<string, string>;
export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; field?: string; fields?: FieldErrors };

/** Zod issues → { "translations.vi.name": "required" } for the form. */
function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

/** Permission first (no field feedback for callers without it), then Zod, then the service. */
async function guarded<S extends z.ZodType>(
  permission: Permission,
  schema: S,
  input: unknown,
  task: (data: z.output<S>) => Promise<ActionResult>,
): Promise<ActionResult> {
  try {
    await requirePermission(permission);
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid", fields: fieldErrors(parsed.error) };
    return await task(parsed.data as z.output<S>);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}

export async function saveDestinationAction(input: unknown): Promise<ActionResult> {
  return guarded("content.manage", destinationSchema, input, service.saveDestination);
}

export async function deleteDestinationAction(input: unknown): Promise<ActionResult> {
  return guarded("content.manage", idSchema, input, ({ id }) => service.deleteDestination(id));
}

export async function saveTravelStyleAction(input: unknown): Promise<ActionResult> {
  return guarded("content.manage", travelStyleSchema, input, service.saveTravelStyle);
}

export async function deleteTravelStyleAction(input: unknown): Promise<ActionResult> {
  return guarded("content.manage", idSchema, input, ({ id }) => service.deleteTravelStyle(id));
}

export async function saveCancellationPolicyAction(input: unknown): Promise<ActionResult> {
  return guarded("settings.manage", cancellationPolicySchema, input, service.saveCancellationPolicy);
}

export async function deleteCancellationPolicyAction(input: unknown): Promise<ActionResult> {
  return guarded("settings.manage", idSchema, input, ({ id }) => service.deleteCancellationPolicy(id));
}

/** For SlugInput on blur: true when free (or already this record's). */
export async function checkSlugAction(input: unknown): Promise<{ available: boolean } | { error: "forbidden" | "invalid" }> {
  const parsed = slugCheckSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  try {
    return { available: await service.isSlugAvailable(parsed.data) };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "forbidden" };
    throw error;
  }
}
