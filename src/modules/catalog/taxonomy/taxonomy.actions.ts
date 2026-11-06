"use server";

import type { z } from "zod";

import { AccessDeniedError } from "@/lib/auth/require-role";

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

async function run<T extends { ok: boolean }>(task: () => Promise<T>): Promise<T | { ok: false; error: "forbidden" }> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}

function parse<S extends z.ZodType>(schema: S, input: unknown) {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? { ok: true as const, data: parsed.data as z.output<S> }
    : { ok: false as const, result: { ok: false as const, error: "invalid", fields: fieldErrors(parsed.error) } };
}

export async function saveDestinationAction(input: unknown): Promise<ActionResult> {
  const parsed = parse(destinationSchema, input);
  if (!parsed.ok) return parsed.result;
  return run(() => service.saveDestination(parsed.data));
}

export async function deleteDestinationAction(input: unknown): Promise<ActionResult> {
  const parsed = parse(idSchema, input);
  if (!parsed.ok) return parsed.result;
  return run(() => service.deleteDestination(parsed.data.id));
}

export async function saveTravelStyleAction(input: unknown): Promise<ActionResult> {
  const parsed = parse(travelStyleSchema, input);
  if (!parsed.ok) return parsed.result;
  return run(() => service.saveTravelStyle(parsed.data));
}

export async function deleteTravelStyleAction(input: unknown): Promise<ActionResult> {
  const parsed = parse(idSchema, input);
  if (!parsed.ok) return parsed.result;
  return run(() => service.deleteTravelStyle(parsed.data.id));
}

export async function saveCancellationPolicyAction(input: unknown): Promise<ActionResult> {
  const parsed = parse(cancellationPolicySchema, input);
  if (!parsed.ok) return parsed.result;
  return run(() => service.saveCancellationPolicy(parsed.data));
}

export async function deleteCancellationPolicyAction(input: unknown): Promise<ActionResult> {
  const parsed = parse(idSchema, input);
  if (!parsed.ok) return parsed.result;
  return run(() => service.deleteCancellationPolicy(parsed.data.id));
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
