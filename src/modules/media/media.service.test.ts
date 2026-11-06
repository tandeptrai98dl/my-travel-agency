import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The service with its data access and auth replaced: the real checks run on real bytes.
const repo = vi.hoisted(() => ({
  createSignedUpload: vi.fn(),
  downloadObject: vi.fn(),
  removeObject: vi.fn(),
  publicUrlFor: vi.fn(async (path: string) => `https://storage.test/media/${path}`),
  insertMedia: vi.fn(),
  findMediaByPath: vi.fn(),
  findMediaById: vi.fn(),
  updateMediaRow: vi.fn(),
  deleteMediaRow: vi.fn(),
  searchMedia: vi.fn(),
}));
vi.mock("./media.repository", () => repo);
vi.mock("@/lib/auth/require-role", () => ({
  requirePermission: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000014", role: "editor" })),
  AccessDeniedError: class extends Error {},
}));

const { createUpload, deleteMedia, finalizeUpload } = await import("./media.service");

const PATH = "2026/11/0f8fad5b-d9cb-469f-a165-70867728950e.png";
const blobOf = (buffer: Buffer) => new Blob([new Uint8Array(buffer)]);

beforeEach(() => {
  vi.clearAllMocks();
  repo.findMediaByPath.mockResolvedValue({ data: null });
  repo.removeObject.mockResolvedValue({ error: null });
  repo.insertMedia.mockImplementation(async (row: Record<string, unknown>) => ({
    data: { id: "m1", created_at: "2026-11-06T00:00:00Z", credit: null, ...row },
    error: null,
  }));
});

describe("createUpload", () => {
  it("issues a signed URL for a generated yyyy/mm/<uuid>.<ext> path", async () => {
    repo.createSignedUpload.mockResolvedValue({ data: { signedUrl: "https://signed" }, error: null });
    const result = await createUpload({ contentType: "image/webp" });
    expect(result.ok && result.value.path).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/);
  });

  it("refuses types other than JPEG, PNG, WebP and AVIF", async () => {
    expect(await createUpload({ contentType: "image/svg+xml" })).toEqual({ ok: false, error: "unsupported_type" });
    expect(repo.createSignedUpload).not.toHaveBeenCalled();
  });
});

describe("finalizeUpload", () => {
  it("records a real image with its displayed size and a blur placeholder", async () => {
    // 3000×2000 PNG with EXIF orientation 6 (rotated): displayed as 2000×3000.
    const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#0f1b2d" } })
      .png()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    repo.downloadObject.mockResolvedValue({ data: blobOf(png), error: null });
    const result = await finalizeUpload({ path: PATH });
    expect(result.ok).toBe(true);
    const row = repo.insertMedia.mock.calls[0][0];
    expect(row).toMatchObject({ path: PATH, mime_type: "image/png", width: 2000, height: 3000, alt: {} });
    expect(row.blur_data_url).toMatch(/^data:image\/webp;base64,/);
    expect(repo.removeObject).not.toHaveBeenCalled();
    expect(result.ok && result.value.small).toBe(false);
  });

  it("deletes and refuses an SVG uploaded as .png", async () => {
    repo.downloadObject.mockResolvedValue({
      data: blobOf(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
      error: null,
    });
    expect(await finalizeUpload({ path: PATH })).toEqual({ ok: false, error: "unsupported_type" });
    expect(repo.removeObject).toHaveBeenCalledWith(PATH);
    expect(repo.insertMedia).not.toHaveBeenCalled();
  });

  it("deletes and refuses a JPEG stored under a .png name", async () => {
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    repo.downloadObject.mockResolvedValue({ data: blobOf(jpeg), error: null });
    expect(await finalizeUpload({ path: PATH })).toEqual({ ok: false, error: "unsupported_type" });
    expect(repo.removeObject).toHaveBeenCalledWith(PATH);
  });

  it("deletes and refuses a corrupt image with a valid signature", async () => {
    const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
    repo.downloadObject.mockResolvedValue({ data: blobOf(broken), error: null });
    expect(await finalizeUpload({ path: PATH })).toEqual({ ok: false, error: "unreadable" });
    expect(repo.removeObject).toHaveBeenCalledWith(PATH);
  });

  it("returns the existing record when the same upload is finalized twice", async () => {
    repo.findMediaByPath.mockResolvedValue({
      data: { id: "m1", path: PATH, mime_type: "image/png", width: 1, height: 1, size_bytes: 1, blur_data_url: null, alt: {}, credit: null, created_at: "x" },
    });
    const result = await finalizeUpload({ path: PATH });
    expect(result.ok && result.value.id).toBe("m1");
    expect(repo.downloadObject).not.toHaveBeenCalled();
  });
});

describe("deleteMedia", () => {
  it("keeps images that content still uses", async () => {
    repo.findMediaById.mockResolvedValue({ data: { id: "m1", path: PATH } });
    repo.deleteMediaRow.mockResolvedValue({ error: { code: "23503" } });
    expect(await deleteMedia({ id: "m1" })).toEqual({ ok: false, error: "in_use" });
    expect(repo.removeObject).not.toHaveBeenCalled();
  });

  it("removes the row, then the stored file", async () => {
    repo.findMediaById.mockResolvedValue({ data: { id: "m1", path: PATH } });
    repo.deleteMediaRow.mockResolvedValue({ error: null });
    expect(await deleteMedia({ id: "m1" })).toEqual({ ok: true, value: null });
    expect(repo.removeObject).toHaveBeenCalledWith(PATH);
  });
});
