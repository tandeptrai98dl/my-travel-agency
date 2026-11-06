import "server-only";

import sharp from "sharp";

import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";

import {
  createSignedUpload,
  deleteMediaRow,
  downloadObject,
  findMediaById,
  findMediaByPath,
  insertMedia,
  type MediaRow,
  publicUrlFor,
  removeObject,
  searchMedia,
  updateMediaRow,
} from "./media.repository";
import {
  isSmall,
  kindForMime,
  kindMatchesExtension,
  MAX_DIMENSION,
  MAX_UPLOAD_BYTES,
  MEDIA_PAGE_SIZE,
  type MediaItem,
  readAlt,
  sanitizeSearch,
} from "./media.schemas";
import { detectImageKind, IMAGE_EXTENSION, IMAGE_MIME, SNIFF_BYTES } from "./media.sniff";

export type UploadError = "too_large" | "unsupported_type" | "unreadable" | "failed";
export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

async function toItem(row: MediaRow): Promise<MediaItem> {
  const alt = readAlt(row.alt);
  return {
    id: row.id,
    path: row.path,
    url: await publicUrlFor(row.path),
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    blurDataUrl: row.blur_data_url,
    alt,
    credit: row.credit,
    createdAt: row.created_at,
    small: isSmall(row.width, row.height),
    altComplete: alt.vi.trim() !== "" && alt.en.trim() !== "",
  };
}

/**
 * Step 1 of an upload: a signed URL the browser sends the file to directly, so large originals
 * never pass through a serverless function (Vercel limits request bodies to 4.5 MB). The object
 * is not usable until `finalizeUpload` has checked it.
 */
export async function createUpload(input: { contentType: string }): Promise<
  Result<{ path: string; signedUrl: string }, "unsupported_type" | "failed">
> {
  await requirePermission("media.manage");
  const kind = kindForMime(input.contentType);
  if (!kind) return { ok: false, error: "unsupported_type" };
  const now = new Date();
  const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${IMAGE_EXTENSION[kind]}`;
  const { data, error } = await createSignedUpload(path);
  if (error || !data) {
    logger.error("media.create_upload_failed", { error: error?.message });
    return { ok: false, error: "failed" };
  }
  return { ok: true, value: { path, signedUrl: data.signedUrl } };
}

/**
 * Step 2: download what was uploaded, check the real type from its bytes (decision 6: JPEG, PNG,
 * WebP or AVIF only, never SVG), the size and the dimensions, make a blur placeholder and record
 * it. Anything rejected is deleted from Storage again.
 */
export async function finalizeUpload(input: { path: string }): Promise<Result<MediaItem, UploadError>> {
  const user = await requirePermission("media.manage");

  const existing = await findMediaByPath(input.path);
  if (existing.data) return { ok: true, value: await toItem(existing.data) };

  const reject = async (error: UploadError): Promise<Result<MediaItem, UploadError>> => {
    const { error: removeError } = await removeObject(input.path);
    if (removeError) logger.error("media.reject_cleanup_failed", { path: input.path, error: removeError.message });
    return { ok: false, error };
  };

  const { data: blob, error: downloadError } = await downloadObject(input.path);
  if (downloadError || !blob) return { ok: false, error: "unreadable" };
  if (blob.size > MAX_UPLOAD_BYTES) return reject("too_large");

  const buffer = Buffer.from(await blob.arrayBuffer());
  const kind = detectImageKind(buffer.subarray(0, SNIFF_BYTES));
  if (!kind || !kindMatchesExtension(kind, input.path)) return reject("unsupported_type");

  let width: number;
  let height: number;
  let blurDataUrl: string;
  try {
    const image = sharp(buffer, { limitInputPixels: MAX_DIMENSION * MAX_DIMENSION, failOn: "error" });
    const metadata = await image.metadata();
    // EXIF orientation 5–8 swaps the displayed width and height.
    const swap = (metadata.orientation ?? 1) >= 5;
    width = (swap ? metadata.height : metadata.width) ?? 0;
    height = (swap ? metadata.width : metadata.height) ?? 0;
    if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) return reject("unreadable");
    const blur = await sharp(buffer).rotate().resize(16, 16, { fit: "inside" }).webp({ quality: 40 }).toBuffer();
    blurDataUrl = `data:image/webp;base64,${blur.toString("base64")}`;
  } catch {
    return reject("unreadable");
  }

  const { data, error } = await insertMedia({
    bucket: "media",
    path: input.path,
    mime_type: IMAGE_MIME[kind],
    width,
    height,
    size_bytes: buffer.byteLength,
    blur_data_url: blurDataUrl,
    alt: {},
    created_by: user.id,
  });
  if (error || !data) {
    // A concurrent finalize of the same upload already recorded it.
    const again = await findMediaByPath(input.path);
    if (again.data) return { ok: true, value: await toItem(again.data) };
    logger.error("media.insert_failed", { path: input.path, error: error?.message });
    return reject("failed");
  }
  return { ok: true, value: await toItem(data) };
}

export async function updateMedia(input: {
  id: string;
  alt: { vi: string; en: string };
  credit: string | null;
}): Promise<Result<MediaItem, "not_found" | "failed">> {
  await requirePermission("media.manage");
  const { data, error } = await updateMediaRow(input.id, { alt: input.alt, credit: input.credit || null });
  if (error || !data) return { ok: false, error: error?.code === "PGRST116" ? "not_found" : "failed" };
  return { ok: true, value: await toItem(data) };
}

/** Deletes an image that nothing uses; images still referenced by content are kept (FK). */
export async function deleteMedia(input: { id: string }): Promise<Result<null, "in_use" | "not_found" | "failed">> {
  await requirePermission("media.manage");
  const { data: row } = await findMediaById(input.id);
  if (!row) return { ok: false, error: "not_found" };
  const { error } = await deleteMediaRow(input.id);
  if (error) return { ok: false, error: error.code === "23503" ? "in_use" : "failed" };
  const { error: removeError } = await removeObject(row.path);
  if (removeError) logger.error("media.object_remove_failed", { path: row.path, error: removeError.message });
  return { ok: true, value: null };
}

export async function listMedia(params: { q: string; page: number }): Promise<{
  items: MediaItem[];
  total: number;
  pageCount: number;
}> {
  await requirePermission("media.manage");
  const from = (params.page - 1) * MEDIA_PAGE_SIZE;
  const { data, error, count } = await searchMedia({
    search: sanitizeSearch(params.q),
    from,
    to: from + MEDIA_PAGE_SIZE - 1,
  });
  if (error) throw new Error(`media query failed: ${error.message}`);
  const items = await Promise.all((data ?? []).map(toItem));
  const total = count ?? items.length;
  return { items, total, pageCount: Math.max(1, Math.ceil(total / MEDIA_PAGE_SIZE)) };
}
