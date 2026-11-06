import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The service with its data access and auth replaced: the real checks run on real bytes.
const repo = vi.hoisted(() => ({
  createSignedUpload: vi.fn(),
  downloadStaged: vi.fn(),
  removeStaged: vi.fn(),
  uploadPublic: vi.fn(),
  removePublic: vi.fn(),
  removePublicAsService: vi.fn(),
  publicUrlFor: vi.fn((path: string) => `https://storage.test/media/${path}`),
  insertMedia: vi.fn(),
  findMediaByPath: vi.fn(),
  findMediaById: vi.fn(),
  updateMediaRow: vi.fn(),
  deleteMediaRow: vi.fn(),
  searchMedia: vi.fn(),
}));
vi.mock("./media.repository", () => repo);
const USER = "00000000-0000-4000-8000-000000000014";
vi.mock("@/lib/auth/require-role", () => ({
  requirePermission: vi.fn(async () => ({ id: USER, role: "editor" })),
  AccessDeniedError: class extends Error {},
}));

const { createUpload, deleteMedia, finalizeUpload } = await import("./media.service");

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const STAGED = `pending/${USER}/${UUID}.png`;
const PUBLIC = new RegExp(`^\\d{4}/\\d{2}/${UUID}\\.png$`);
const blobOf = (buffer: Buffer) => new Blob([new Uint8Array(buffer)]);
const finalize = (path = STAGED) => finalizeUpload({ path, fileName: "vinh-ha-long.png" });

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#0f1b2d" } });

beforeEach(() => {
  vi.clearAllMocks();
  repo.findMediaByPath.mockResolvedValue({ data: null });
  repo.removeStaged.mockResolvedValue({ error: null });
  repo.removePublic.mockResolvedValue({ error: null });
  repo.removePublicAsService.mockResolvedValue({ error: null });
  repo.uploadPublic.mockResolvedValue({ data: {}, error: null });
  repo.insertMedia.mockImplementation(async (row: Record<string, unknown>) => ({
    data: { id: "m1", created_at: "2026-11-06T00:00:00Z", credit: null, ...row },
    error: null,
  }));
});

describe("createUpload", () => {
  it("signs a private staging path in the user's own folder", async () => {
    repo.createSignedUpload.mockResolvedValue({ data: { signedUrl: "https://signed" }, error: null });
    const result = await createUpload({ contentType: "image/webp" });
    expect(result.ok && result.value.path).toMatch(new RegExp(`^pending/${USER}/[0-9a-f-]{36}\\.webp$`));
  });

  it("refuses types other than JPEG, PNG, WebP and AVIF", async () => {
    expect(await createUpload({ contentType: "image/svg+xml" })).toEqual({ ok: false, error: "unsupported_type" });
    expect(repo.createSignedUpload).not.toHaveBeenCalled();
  });
});

describe("finalizeUpload", () => {
  it("publishes a re-encoded copy with its displayed size and a blur placeholder", async () => {
    // 3000×2000 PNG with EXIF orientation 6 (rotated): displayed as 2000×3000.
    const png = await solid(3000, 2000).png().withMetadata({ orientation: 6 }).toBuffer();
    repo.downloadStaged.mockResolvedValue({ data: blobOf(png), error: null });
    const result = await finalize();
    expect(result.ok).toBe(true);

    const [publicPath, body, contentType] = repo.uploadPublic.mock.calls[0];
    expect(publicPath).toMatch(PUBLIC);
    expect(contentType).toBe("image/png");
    const published = await sharp(body).metadata();
    expect([published.width, published.height, published.orientation]).toEqual([2000, 3000, undefined]);

    const row = repo.insertMedia.mock.calls[0][0];
    expect(row).toMatchObject({
      path: publicPath,
      original_name: "vinh-ha-long.png",
      mime_type: "image/png",
      width: 2000,
      height: 3000,
      size_bytes: body.byteLength,
      alt: {},
    });
    expect(row.blur_data_url).toMatch(/^data:image\/webp;base64,/);
    expect(repo.removeStaged).toHaveBeenCalledWith(STAGED);
    expect(result.ok && result.value.small).toBe(false);
  });

  it("drops EXIF/GPS metadata and anything appended after the image", async () => {
    const jpeg = await solid(64, 64)
      .jpeg()
      .withExif({ IFD0: { Artist: "secret-artist" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "10/1 46/1 0/1" } })
      .toBuffer();
    const tail = Buffer.from("<script>alert(1)</script>");
    repo.downloadStaged.mockResolvedValue({ data: blobOf(Buffer.concat([jpeg, tail])), error: null });
    const path = `pending/${USER}/${UUID}.jpg`;
    expect((await finalizeUpload({ path, fileName: "a.jpg" })).ok).toBe(true);
    const body: Buffer = repo.uploadPublic.mock.calls[0][1];
    const meta = await sharp(body).metadata();
    expect(meta.exif).toBeUndefined();
    expect(body.includes("secret-artist")).toBe(false);
    expect(body.includes("<script>")).toBe(false);
  });

  it("accepts a real AV1 AVIF", async () => {
    const avif = await solid(32, 24).avif().toBuffer();
    repo.downloadStaged.mockResolvedValue({ data: blobOf(avif), error: null });
    const result = await finalizeUpload({ path: `pending/${USER}/${UUID}.avif`, fileName: "a.avif" });
    expect(result.ok && result.value.mimeType).toBe("image/avif");
  });

  it("refuses another user's staged upload without touching it", async () => {
    const other = `pending/00000000-0000-4000-8000-000000000099/${UUID}.png`;
    expect(await finalize(other)).toEqual({ ok: false, error: "unreadable" });
    expect(repo.downloadStaged).not.toHaveBeenCalled();
    expect(repo.removeStaged).not.toHaveBeenCalled();
  });

  it("deletes and refuses an SVG uploaded as .png", async () => {
    repo.downloadStaged.mockResolvedValue({
      data: blobOf(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
      error: null,
    });
    expect(await finalize()).toEqual({ ok: false, error: "unsupported_type" });
    expect(repo.removeStaged).toHaveBeenCalledWith(STAGED);
    expect(repo.uploadPublic).not.toHaveBeenCalled();
    expect(repo.insertMedia).not.toHaveBeenCalled();
  });

  it("deletes and refuses a JPEG stored under a .png name", async () => {
    const jpeg = await solid(10, 10).jpeg().toBuffer();
    repo.downloadStaged.mockResolvedValue({ data: blobOf(jpeg), error: null });
    expect(await finalize()).toEqual({ ok: false, error: "unsupported_type" });
    expect(repo.removeStaged).toHaveBeenCalledWith(STAGED);
  });

  it("deletes and refuses a corrupt image with a valid signature", async () => {
    const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
    repo.downloadStaged.mockResolvedValue({ data: blobOf(broken), error: null });
    expect(await finalize()).toEqual({ ok: false, error: "unreadable" });
    expect(repo.removeStaged).toHaveBeenCalledWith(STAGED);
  });

  it("refuses images over the pixel budget before decoding them", async () => {
    // 8000×7000 = 56 MP: under the 12 000 px edge limit, over the 50 MP budget.
    const big = await solid(8000, 7000).png({ compressionLevel: 9 }).toBuffer();
    repo.downloadStaged.mockResolvedValue({ data: blobOf(big), error: null });
    expect(await finalize()).toEqual({ ok: false, error: "unreadable" });
    expect(repo.uploadPublic).not.toHaveBeenCalled();
  });

  it("returns the existing record when the same upload is finalized twice", async () => {
    repo.findMediaByPath.mockResolvedValue({
      data: { id: "m1", path: "2026/11/x.png", original_name: null, mime_type: "image/png", width: 1, height: 1, size_bytes: 1, blur_data_url: null, alt: {}, credit: null, created_at: "x" },
    });
    const result = await finalize();
    expect(result.ok && result.value.id).toBe("m1");
    expect(repo.downloadStaged).not.toHaveBeenCalled();
  });

  it("removes the public copy again when recording fails", async () => {
    const png = await solid(20, 20).png().toBuffer();
    repo.downloadStaged.mockResolvedValue({ data: blobOf(png), error: null });
    repo.insertMedia.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
    expect(await finalize()).toEqual({ ok: false, error: "failed" });
    expect(repo.removePublicAsService).toHaveBeenCalledWith(expect.stringMatching(PUBLIC));
    expect(repo.removeStaged).toHaveBeenCalledWith(STAGED);
  });
});

describe("deleteMedia", () => {
  const PATH = `2026/11/${UUID}.png`;

  it("keeps images that content still uses", async () => {
    repo.findMediaById.mockResolvedValue({ data: { id: "m1", path: PATH } });
    repo.deleteMediaRow.mockResolvedValue({ data: null, error: { code: "23503" } });
    expect(await deleteMedia({ id: "m1" })).toEqual({ ok: false, error: "in_use" });
    expect(repo.removePublic).not.toHaveBeenCalled();
  });

  it("keeps the file when no row was actually deleted", async () => {
    repo.findMediaById.mockResolvedValue({ data: { id: "m1", path: PATH } });
    repo.deleteMediaRow.mockResolvedValue({ data: [], error: null });
    expect(await deleteMedia({ id: "m1" })).toEqual({ ok: false, error: "not_found" });
    expect(repo.removePublic).not.toHaveBeenCalled();
  });

  it("removes the row, then the stored file", async () => {
    repo.findMediaById.mockResolvedValue({ data: { id: "m1", path: PATH } });
    repo.deleteMediaRow.mockResolvedValue({ data: [{ id: "m1" }], error: null });
    expect(await deleteMedia({ id: "m1" })).toEqual({ ok: true, value: null });
    expect(repo.removePublic).toHaveBeenCalledWith(PATH);
  });
});
