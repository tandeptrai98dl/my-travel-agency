"use server";

import type { z } from "zod";

import type { Permission } from "@/lib/auth/permissions";
import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";

import { departureEditSchema, departureIdSchema, departurePlanSchema, departureTourSchema } from "./departures.schemas";
import * as service from "./departures.service";

export type FieldErrors = Record<string, string>;
type Failure = { ok: false; error: string; field?: string; fields?: FieldErrors; invalid?: string[] };

function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

/** Permission first (no field feedback for callers without it), then Zod, then the service. */
async function guarded<S extends z.ZodType, R>(
  permission: Permission,
  schema: S,
  input: unknown,
  task: (data: z.output<S>) => Promise<R>,
): Promise<R | Failure> {
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

export async function departureDefaultsAction(input: unknown) {
  return guarded("departures.edit", departureTourSchema, input, (data) => service.getCreateDefaults(data.tourId));
}

export async function previewDeparturesAction(input: unknown) {
  return guarded("departures.edit", departurePlanSchema, input, service.previewDepartures);
}

export async function createDeparturesAction(input: unknown) {
  return guarded("departures.edit", departurePlanSchema, input, service.createDepartures);
}

export async function saveDepartureAction(input: unknown) {
  return guarded("departures.edit", departureEditSchema, input, service.saveDeparture);
}

export async function deleteDepartureAction(input: unknown) {
  return guarded("departures.edit", departureIdSchema, input, service.deleteDeparture);
}
