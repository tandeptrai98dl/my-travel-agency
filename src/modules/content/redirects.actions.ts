"use server";

import type { z } from "zod";

import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";

import { redirectIdSchema, redirectSchema } from "./redirects.schemas";
import * as service from "./redirects.service";

type Failure = { ok: false; error: string; field?: string; fields?: Record<string, string> };

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

/** Permission first, then Zod, then the service. */
async function guarded<S extends z.ZodType, R>(schema: S, input: unknown, task: (data: z.output<S>) => Promise<R>): Promise<R | Failure> {
  try {
    await requirePermission("redirects.manage");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid", fields: fieldErrors(parsed.error) };
    return await task(parsed.data as z.output<S>);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}

export async function createRedirectAction(input: unknown) {
  return guarded(redirectSchema, input, service.createRedirect);
}

export async function deleteRedirectAction(input: unknown) {
  return guarded(redirectIdSchema, input, (data) => service.deleteRedirect(data.id));
}

export async function resyncRedirectsAction() {
  try {
    return await service.resyncRedirects();
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false as const, error: "forbidden" };
    throw error;
  }
}
