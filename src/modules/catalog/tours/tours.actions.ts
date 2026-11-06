"use server";

import type { z } from "zod";

import type { Permission } from "@/lib/auth/permissions";
import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";

import { duplicateTourSchema, newTourSchema, tourSchema, tourSlugCheckSchema } from "./tours.schemas";
import * as service from "./tours.service";

export type FieldErrors = Record<string, string>;
export type TourActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; field?: string; fields?: FieldErrors };

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
  task: (data: z.output<S>) => Promise<TourActionResult>,
): Promise<TourActionResult> {
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

export async function createTourAction(input: unknown): Promise<TourActionResult> {
  return guarded("tours.edit_content", newTourSchema, input, service.createTour);
}

export async function saveTourAction(input: unknown): Promise<TourActionResult> {
  return guarded("tours.edit_content", tourSchema, input, service.saveTour);
}

export async function duplicateTourAction(input: unknown): Promise<TourActionResult> {
  return guarded("tours.edit_content", duplicateTourSchema, input, service.duplicateTour);
}

export async function checkTourSlugAction(input: unknown): Promise<{ available: boolean } | { error: string }> {
  try {
    await requirePermission("tours.edit_content");
    const parsed = tourSlugCheckSchema.safeParse(input);
    if (!parsed.success) return { error: "invalid" };
    return { available: await service.isTourSlugAvailable(parsed.data) };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "forbidden" };
    throw error;
  }
}
