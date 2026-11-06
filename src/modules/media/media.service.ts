import "server-only";

import sharp, { type OutputInfo, type Sharp, type SharpOptions } from "sharp";

import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";

import {
  createSignedUpload,
  deleteMediaRow,
  downloadStaged,
  findMediaById,
  findMediaByUploadId,
  insertMedia,
  type MediaRow,
  publicUrlFor,
  removePublic,
  removePublicAsService,
  removeStaged,
  searchMedia,
  updateMediaRow,
  uploadPublic,
} from "./media.repository";
import {
  isSmall,
  kindForMime,
  kindMatchesExtension,
  MAX_AVIF_PIXELS,
  MAX_DIMENSION,
  MAX_PIXELS,
  MAX_UPLOAD_BYTES,
  MEDIA_PAGE_SIZE,
  type MediaItem,
  readAlt,
  sanitizeSearch,
  STAGED_PATH,
} from "./media.schemas";
import { detectImageKind, IMAGE_EXTENSION, IMAGE_MIME, type ImageKind, SNIFF_BYTES } from "./media.sniff";

// One image at a time per function instance and no decoded-image cache: originals can be large,
// and serverless memory is small.
sharp.cache(false);
sharp.concurrency(1);

export type UploadError = "too_large" | "unsupported_type" | "unreadable" | "failed";
export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

function toItem(row: MediaRow): MediaItem {
  const alt = readAlt(row.alt);
  return {
    id: row.id,
    path: row.path,
    originalName: row.original_name,
    url: publicUrlFor(row.path),
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

/** The public path a staged upload is copied to: same UUID, so finalizing twice is idempotent. */
function publicPathFor(uuid: string, ext: string, now = new Date()): string {
  return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${uuid}.${ext}`;
}

/** Re-encode in the same format. Metadata (EXIF, GPS, XMP) is dropped; the colour profile kept. */
function encode(image: Sharp, kind: ImageKind): Sharp {
  switch (kind) {
    case "jpeg":
      return image.jpeg({ quality: 90, mozjpeg: true });
    case "png":
      return image.png({ compressionLevel: 9, adaptiveFiltering: true });
    case "webp":
      return image.webp({ quality: 90 });
    case "avif":
      return image.avif({ quality: 70, effort: 2 });
  }
}

/**
 * Step 1 of an upload: a signed URL the browser sends the original to directly, so large files
 * never pass through a serverless function (Vercel limits request bodies to 4.5 MB). It points
 * into the private `media-uploads` bucket under the user's own folder; nothing there is public.
 */
export async function createUpload(input: { contentType: string }): Promise<
  Result<{ path: string; signedUrl: string }, "unsupported_type" | "failed">
> {
  const user = await requirePermission("media.manage");
  const kind = kindForMime(input.contentType);
  if (!kind) return { ok: false, error: "unsupported_type" };
  const path = `pending/${user.id}/${crypto.randomUUID()}.${IMAGE_EXTENSION[kind]}`;
  const { data, error } = await createSignedUpload(path);
  if (error || !data) {
    logger.error("media.create_upload_failed", { error: error?.message });
    return { ok: false, error: "failed" };
  }
  return { ok: true, value: { path, signedUrl: data.signedUrl } };
}

/**
 * Step 2: download the staged original, check the real type from its bytes (decision 6: JPEG,
 * PNG, WebP or AVIF only, never SVG), the size, the dimensions and the pixel count, then
 * re-encode it with sharp, which drops EXIF/GPS metadata and anything hidden after the image
 * data. Only that clean copy is written to the public `media` bucket and recorded. The staged
 * original is always deleted.
 */
export async function finalizeUpload(input: {
  path: string;
  fileName: string;
}): Promise<Result<MediaItem, UploadError>> {
  const user = await requirePermission("media.manage");

  const match = STAGED_PATH.exec(input.path);
  // Only the user's own staged uploads (the folder carries the user id the server put there).
  if (!match || match[1] !== user.id) return { ok: false, error: "unreadable" };
  const [, , uuid, ext] = match;
  const publicPath = publicPathFor(uuid, ext);

  const dropStaged = async () => {
    const { error } = await removeStaged(input.path);
    if (error) logger.error("media.staged_cleanup_failed", { path: input.path, error: error.message });
  };
  const recorded = async () => (await findMediaByUploadId(uuid, ext)).data;

  const existing = await recorded();
  if (existing) {
    await dropStaged();
    return { ok: true, value: toItem(existing) };
  }
  const reject = async (error: UploadError): Promise<Result<MediaItem, UploadError>> => {
    await dropStaged();
    return { ok: false, error };
  };

  const { data: blob, error: downloadError } = await downloadStaged(input.path);
  if (downloadError || !blob) {
    // A concurrent finalize of the same upload may have finished and removed the original.
    const again = await recorded();
    if (again) return { ok: true, value: toItem(again) };
    return { ok: false, error: "unreadable" };
  }
  if (blob.size > MAX_UPLOAD_BYTES) return reject("too_large");

  const original = Buffer.from(await blob.arrayBuffer());
  const kind = detectImageKind(original.subarray(0, SNIFF_BYTES));
  if (!kind || !kindMatchesExtension(kind, input.path)) return reject("unsupported_type");

  const maxPixels = kind === "avif" ? MAX_AVIF_PIXELS : MAX_PIXELS;
  const options: SharpOptions = { limitInputPixels: maxPixels, failOn: "error" };
  let clean: { data: Buffer; info: OutputInfo };
  let blurDataUrl: string;
  try {
    const metadata = await sharp(original, options).metadata();
    // An AVIF brand around HEVC data is HEIC, which browsers cannot show.
    if (kind === "avif" && metadata.compression !== "av1") return reject("unsupported_type");
    const { width, height } = metadata;
    if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > maxPixels) {
      return reject("unreadable");
    }
    clean = await encode(sharp(original, options).rotate().keepIccProfile(), kind).toBuffer({
      resolveWithObject: true,
    });
    const blur = await sharp(clean.data, options).resize(16, 16, { fit: "inside" }).webp({ quality: 40 }).toBuffer();
    blurDataUrl = `data:image/webp;base64,${blur.toString("base64")}`;
  } catch {
    return reject("unreadable");
  }
  if (clean.data.byteLength > MAX_UPLOAD_BYTES) return reject("too_large");

  const { error: uploadError } = await uploadPublic(publicPath, clean.data, IMAGE_MIME[kind]);
  if (uploadError) {
    logger.error("media.public_upload_failed", { path: publicPath, error: uploadError.message });
    return { ok: false, error: "failed" };
  }

  const { data, error } = await insertMedia({
    bucket: "media",
    path: publicPath,
    original_name: input.fileName || null,
    mime_type: IMAGE_MIME[kind],
    // The orientation is applied, so the encoded size is the displayed size.
    width: clean.info.width,
    height: clean.info.height,
    size_bytes: clean.data.byteLength,
    blur_data_url: blurDataUrl,
    alt: {},
    created_by: user.id,
  });
  if (error || !data) {
    // A concurrent finalize of the same upload recorded it first.
    const again = await recorded();
    if (again) {
      await dropStaged();
      return { ok: true, value: toItem(again) };
    }
    logger.error("media.insert_failed", { path: publicPath, error: error?.message });
    const { error: removeError } = await removePublicAsService(publicPath);
    if (removeError) logger.error("media.public_cleanup_failed", { path: publicPath, error: removeError.message });
    return reject("failed");
  }
  await dropStaged();
  return { ok: true, value: toItem(data) };
}

export async function updateMedia(input: {
  id: string;
  alt: { vi: string; en: string };
  credit: string | null;
}): Promise<Result<MediaItem, "not_found" | "failed">> {
  await requirePermission("media.manage");
  const { data, error } = await updateMediaRow(input.id, { alt: input.alt, credit: input.credit || null });
  if (error || !data) return { ok: false, error: error?.code === "PGRST116" ? "not_found" : "failed" };
  return { ok: true, value: toItem(data) };
}

/** Deletes an image that nothing uses; images still referenced by content are kept (FK). */
export async function deleteMedia(input: { id: string }): Promise<Result<null, "in_use" | "not_found" | "failed">> {
  await requirePermission("media.manage");
  const { data: row } = await findMediaById(input.id);
  if (!row) return { ok: false, error: "not_found" };
  const { data: deleted, error } = await deleteMediaRow(input.id);
  if (error) return { ok: false, error: error.code === "23503" ? "in_use" : "failed" };
  // Zero rows means RLS or a concurrent delete kept it: leave the file alone.
  if (deleted?.length !== 1) return { ok: false, error: "not_found" };
  const { error: removeError } = await removePublic(row.path);
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
  const items = (data ?? []).map(toItem);
  const total = count ?? items.length;
  return { items, total, pageCount: Math.max(1, Math.ceil(total / MEDIA_PAGE_SIZE)) };
}
