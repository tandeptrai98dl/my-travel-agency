"use server";

import type { z } from "zod";

import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";

import {
  categorySchema,
  contentIdSchema,
  contentSlugCheckSchema,
  pageSchema,
  postSchema,
} from "./content.schemas";
import * as service from "./content.service";

export type FieldErrors = Record<string, string>;
export type ContentActionResult =
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
  schema: S,
  input: unknown,
  task: (data: z.output<S>) => Promise<ContentActionResult>,
): Promise<ContentActionResult> {
  try {
    await requirePermission("content.manage");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid", fields: fieldErrors(parsed.error) };
    return await task(parsed.data as z.output<S>);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}

export async function savePostAction(input: unknown): Promise<ContentActionResult> {
  return guarded(postSchema, input, service.savePost);
}

export async function deletePostAction(input: unknown): Promise<ContentActionResult> {
  return guarded(contentIdSchema, input, (data) => service.deletePost(data.id));
}

export async function saveCategoryAction(input: unknown): Promise<ContentActionResult> {
  return guarded(categorySchema, input, service.saveCategory);
}

export async function deleteCategoryAction(input: unknown): Promise<ContentActionResult> {
  return guarded(contentIdSchema, input, (data) => service.deleteCategory(data.id));
}

export async function savePageAction(input: unknown): Promise<ContentActionResult> {
  return guarded(pageSchema, input, service.savePage);
}

export async function checkContentSlugAction(input: unknown): Promise<{ available: boolean } | { error: string }> {
  try {
    await requirePermission("content.manage");
    const parsed = contentSlugCheckSchema.safeParse(input);
    if (!parsed.success) return { error: "invalid" };
    return { available: await service.isSlugAvailable(parsed.data) };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "forbidden" };
    throw error;
  }
}
