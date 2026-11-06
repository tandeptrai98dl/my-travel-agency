"use server";

import { AccessDeniedError } from "@/lib/auth/require-role";

import {
  createUploadSchema,
  finalizeUploadSchema,
  listMediaSchema,
  mediaIdSchema,
  type MediaItem,
  updateMediaSchema,
} from "./media.schemas";
import {
  createUpload,
  deleteMedia,
  finalizeUpload,
  listMedia,
  type Result,
  updateMedia,
  type UploadError,
} from "./media.service";

type Denied = "forbidden" | "invalid";

/** Thin Server Actions (ARCHITECTURE.md data flow): Zod, then the service (which calls requirePermission). */
async function guarded<T, E extends string>(run: () => Promise<Result<T, E>>): Promise<Result<T, E | Denied>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}

export async function startMediaUpload(input: unknown) {
  const parsed = createUploadSchema.safeParse(input);
  if (!parsed.success) {
    const tooLarge = parsed.error.issues.some((issue) => issue.path[0] === "size" && issue.code === "too_big");
    return { ok: false as const, error: tooLarge ? ("too_large" as const) : ("unsupported_type" as const) };
  }
  return guarded(() => createUpload(parsed.data));
}

export async function completeMediaUpload(input: unknown): Promise<Result<MediaItem, UploadError | Denied>> {
  const parsed = finalizeUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return guarded(() => finalizeUpload(parsed.data));
}

export async function saveMediaDetails(input: unknown) {
  const parsed = updateMediaSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  return guarded(() => updateMedia(parsed.data));
}

export async function removeMedia(input: unknown) {
  const parsed = mediaIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  return guarded(() => deleteMedia(parsed.data));
}

/** For the MediaPicker dialog. */
export async function browseMedia(input: unknown) {
  const params = listMediaSchema.parse(input ?? {});
  try {
    return { ok: true as const, value: await listMedia(params) };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false as const, error: "forbidden" as const };
    throw error;
  }
}
