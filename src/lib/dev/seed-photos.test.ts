import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { MAX_DIMENSION, MAX_PIXELS, MAX_UPLOAD_BYTES } from "@/modules/media/media.schemas";

import {
  createSupabaseStore,
  type PhotoProvider,
  type SampleRow,
  SAMPLE_CREDIT,
  type SeedStore,
  seedSampleMedia,
} from "../../../scripts/lib/seed-media";
import {
  createPhotoProvider,
  creditFor,
  downloadPhoto,
  DRAWING,
  type FetchLike,
  isAllowedPhotoUrl,
  MAX_PHOTO_BYTES,
  PHOTO_MAX_DIMENSION,
  PHOTO_MAX_PIXELS,
  PhotoError,
  isSeedRow,
  photoForRow,
  processPhoto,
  SEED_PHOTOS,
  SEED_ROW_PHOTOS,
  seedUuid,
} from "../../../scripts/lib/seed-photos";

const SEED_SQL = readFileSync(fileURLToPath(new URL("../../../supabase/seed.sql", import.meta.url)), "utf8");

/** The ids `supabase/seed.sql` gives its `Sample image` rows (tour heroes and journal covers). */
function seededSampleKeys(): string[] {
  // Tour codes: the first tours' insert and the listing sample both start rows with ('<code>', '<type>'.
  const codes = [...SEED_SQL.matchAll(/^\s*\('([A-Z]{2}-[A-Z]{2,3}-\d{2})', '(?:group|private)'/gm)].map((m) => m[1]);
  // Journal covers: the values list of the "Journal covers" insert, plus inserts that name their
  // seed text literally (the scheduled article).
  const covers = SEED_SQL.slice(SEED_SQL.indexOf("-- Journal covers"));
  const block = covers.slice(0, covers.indexOf(") as v(key, alt_vi, alt_en)"));
  const posts = [...block.matchAll(/^\s*\('([a-z-]+)', '/gm)].map((m) => m[1]);
  const literal = [...SEED_SQL.matchAll(/seed_uuid\('seed-post-([a-z-]+)'\), '2026\//g)].map((m) => m[1]);
  return [...codes.map((code) => `seed-media-${code}`), ...[...posts, ...literal].map((key) => `seed-post-${key}`)];
}

function sampleRow(seed: string, extra: Partial<SampleRow> = {}): SampleRow {
  const id = seedUuid(seed);
  return {
    id,
    bucket: "media",
    path: `2026/01/${id}.jpg`,
    mime_type: "image/jpeg",
    width: 240,
    height: 160,
    credit: SAMPLE_CREDIT,
    alt: { en: "Sample" },
    ...extra,
  };
}

async function jpeg(width: number, height: number, options: { orientation?: number } = {}): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background: "#2A3A52" } });
  const withMeta = options.orientation
    ? image.withMetadata({ orientation: options.orientation, exif: { IFD0: { Copyright: "secret-gps-like-tag" } } })
    : image;
  return withMeta.jpeg({ quality: 70 }).toBuffer();
}

function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, init);
}

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe("manifest", () => {
  it("lists each photo once, with a verified Unsplash page and an allowed download URL", () => {
    const keys = SEED_PHOTOS.map((photo) => photo.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SEED_PHOTOS.length).toBeGreaterThanOrEqual(12);
    for (const photo of SEED_PHOTOS) {
      expect(photo.pageUrl).toMatch(/^https:\/\/unsplash\.com\/photos\/[A-Za-z0-9_-]{11}$/);
      expect(isAllowedPhotoUrl(new URL(photo.downloadUrl))).toBe(true);
      expect(photo.downloadUrl).toMatch(/^https:\/\/images\.unsplash\.com\/photo-\d+-[0-9a-f]+\?/);
      expect(photo.licence).toBe("Unsplash License");
      expect(photo.author.trim()).not.toBe("");
      expect(photo.keywords.every((word) => word === word.toLowerCase())).toBe(true);
    }
  });

  it("maps every one of the 36 seeded sample rows to a photo or, explicitly, the drawing", () => {
    const seeded = seededSampleKeys();
    expect(seeded).toHaveLength(36);
    // Independent of how the inserts are laid out: every tour code named anywhere in the seed
    // (every tour gets a hero row) is among the parsed ones.
    const named = new Set([...SEED_SQL.matchAll(/'([A-Z]{2}-[A-Z]{2,3}-\d{2})'/g)].map((m) => `seed-media-${m[1]}`));
    expect(seeded.filter((key) => key.startsWith("seed-media-")).sort()).toEqual([...named].sort());
    // Likewise every post the seed names (posts reuse their cover's id) has a parsed cover row.
    const posts = new Set([...SEED_SQL.matchAll(/seed_uuid\('seed-post-([a-z-]+)'\)/g)].map((m) => `seed-post-${m[1]}`));
    expect(seeded.filter((key) => key.startsWith("seed-post-")).sort()).toEqual([...posts].sort());
    expect(Object.keys(SEED_ROW_PHOTOS).sort()).toEqual([...seeded].sort());
    const keys = new Set(SEED_PHOTOS.map((photo) => photo.key));
    for (const choice of Object.values(SEED_ROW_PHOTOS)) {
      expect(choice === DRAWING || keys.has(choice)).toBe(true);
    }
    // No photo sits in the manifest unused.
    expect(new Set(Object.values(SEED_ROW_PHOTOS))).toEqual(keys);
  });

  it("builds ids the way pg_temp.seed_uuid() does in seed.sql", () => {
    // Values computed by Postgres 16 with the seed's function body.
    expect(seedUuid("seed-media-VN-HLB-03")).toBe("7a6094e1-f476-4a8a-8027-602a29961bdb");
    expect(seedUuid("seed-post-scheduled")).toBe("1544b336-8087-4b5b-8a03-f5f0f858faf1");
    expect(seedUuid("seed-media-FR-PAR-07")).toBe("1f5d2366-12e1-498a-83c1-864b82d047f2");
  });

  it("keeps the image limits equal to the media service's", () => {
    expect(PHOTO_MAX_DIMENSION).toBe(MAX_DIMENSION);
    expect(PHOTO_MAX_PIXELS).toBe(MAX_PIXELS);
    expect(MAX_PHOTO_BYTES).toBe(MAX_UPLOAD_BYTES);
  });
});

describe("photoForRow", () => {
  it("finds the photo by the seeded id", () => {
    expect(photoForRow(sampleRow("seed-media-VN-HLB-03"))?.key).toBe("ha-long-bay");
    expect(photoForRow(sampleRow("seed-post-provence"))?.key).toBe("provence-lavender");
    expect(photoForRow({ id: seedUuid("seed-media-TH-CNX-09").toUpperCase(), alt: {} })?.key).toBe("doi-inthanon");
  });

  it("falls back to keywords in either language, then to the drawing", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(photoForRow({ id, alt: { vi: "Vịnh Hạ Long lúc bình minh" } })?.key).toBe("ha-long-bay");
    expect(photoForRow({ id, alt: { en: "Old temples of Bangkok" } })?.key).toBe("bangkok-wat-arun");
    expect(photoForRow({ id, alt: { en: "A quiet afternoon" } })).toBeNull();
    expect(photoForRow({ id, alt: null })).toBeNull();
  });

  it("never uses keywords when only seed rows may match", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(photoForRow({ id, alt: { en: "Paris" } }, { seedOnly: true })).toBeNull();
    expect(photoForRow(sampleRow("seed-media-FR-PAR-03"), { seedOnly: true })?.key).toBe("paris");
  });
});

describe("isSeedRow", () => {
  it("accepts only a seed id in the media bucket at the seed's own path", () => {
    const seed = sampleRow("seed-media-VN-HLB-03");
    expect(isSeedRow(seed)).toBe(true);
    expect(isSeedRow({ ...seed, path: `2026/02/${seed.id}.jpg` })).toBe(false);
    expect(isSeedRow({ ...seed, path: `2026/01/${seed.id}.png` })).toBe(false);
    expect(isSeedRow({ ...seed, bucket: "private" })).toBe(false);
    expect(isSeedRow({ ...seed, id: seed.id.toUpperCase(), path: `2026/01/${seed.id.toUpperCase()}.jpg` })).toBe(false);
    const other = "5f0c2d1e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
    expect(isSeedRow({ id: other, bucket: "media", path: `2026/01/${other}.jpg` })).toBe(false);
    for (const seedText of Object.keys(SEED_ROW_PHOTOS)) {
      expect(isSeedRow(sampleRow(seedText))).toBe(true);
    }
  });
});

describe("creditFor", () => {
  it("names the photographer and the source, within the admin's 200-character limit", () => {
    for (const photo of SEED_PHOTOS) {
      const credit = creditFor(photo);
      expect(credit).toBe(`Photo: ${photo.author} / Unsplash`);
      expect(credit).not.toBe(SAMPLE_CREDIT);
      expect(credit.length).toBeLessThanOrEqual(200);
    }
    expect(creditFor({ author: "Fré Sonneveld", source: "Unsplash" })).toBe("Photo: Fré Sonneveld / Unsplash");
    expect(creditFor({ author: " A\u0000B‮ \n C ", source: "Pexels" })).toBe("Photo: AB C / Pexels");
    expect(creditFor({ author: "x".repeat(500), source: "Unsplash" }).length).toBeLessThanOrEqual(200);
  });
});

describe("isAllowedPhotoUrl", () => {
  it("accepts https on the listed hosts only", () => {
    expect(isAllowedPhotoUrl(new URL("https://images.unsplash.com/photo-1-a?w=2400"))).toBe(true);
    expect(isAllowedPhotoUrl(new URL("https://images.pexels.com/photos/1/a.jpeg"))).toBe(true);
    expect(isAllowedPhotoUrl(new URL("http://images.unsplash.com/photo-1-a"))).toBe(false);
    expect(isAllowedPhotoUrl(new URL("https://images.unsplash.com.example.com/photo"))).toBe(false);
    expect(isAllowedPhotoUrl(new URL("https://example.com/photo.jpg"))).toBe(false);
    expect(isAllowedPhotoUrl(new URL("https://images.unsplash.com:8443/photo"))).toBe(false);
    expect(isAllowedPhotoUrl(new URL("https://user:pw@images.unsplash.com/photo"))).toBe(false);
  });
});

describe("downloadPhoto", () => {
  const url = "https://images.unsplash.com/photo-1-a?w=2400";

  async function reason(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (error) {
      return error instanceof PhotoError ? error.reason : "other";
    }
    return "resolved";
  }

  it("returns the body and asks the fetch not to follow redirects itself", async () => {
    const fetch = vi.fn<FetchLike>(async () => response(new Uint8Array([1, 2, 3])));
    expect([...(await downloadPhoto(url, { fetch }))]).toEqual([1, 2, 3]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("refuses http and other hosts without fetching", async () => {
    const fetch = vi.fn<FetchLike>(async () => response("x"));
    expect(await reason(downloadPhoto("http://images.unsplash.com/photo-1-a", { fetch }))).toBe("url");
    expect(await reason(downloadPhoto("https://example.com/a.jpg", { fetch }))).toBe("url");
    expect(await reason(downloadPhoto("not a url", { fetch }))).toBe("url");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("follows redirects within the allow-list and refuses one to another host", async () => {
    const ok = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(redirect("https://images.pexels.com/photos/1/a.jpeg", 301))
      .mockResolvedValueOnce(response(new Uint8Array([9])));
    expect([...(await downloadPhoto(url, { fetch: ok }))]).toEqual([9]);
    expect(ok.mock.calls[1][0].href).toBe("https://images.pexels.com/photos/1/a.jpeg");

    const away = vi.fn<FetchLike>().mockResolvedValueOnce(redirect("https://evil.example/a.jpg"));
    expect(await reason(downloadPhoto(url, { fetch: away }))).toBe("redirect");
    expect(away).toHaveBeenCalledTimes(1);

    const downgrade = vi.fn<FetchLike>().mockResolvedValueOnce(redirect("http://images.unsplash.com/photo-1-a"));
    expect(await reason(downloadPhoto(url, { fetch: downgrade }))).toBe("redirect");

    const loop = vi.fn<FetchLike>(async () => redirect(url));
    expect(await reason(downloadPhoto(url, { fetch: loop }))).toBe("redirect");
    expect(loop).toHaveBeenCalledTimes(4);

    const empty = vi.fn<FetchLike>().mockResolvedValueOnce(new Response(null, { status: 302 }));
    expect(await reason(downloadPhoto(url, { fetch: empty }))).toBe("redirect");
  });

  it("enforces the size cap from the header and while streaming", async () => {
    const declared = vi.fn<FetchLike>(async () =>
      response("x", { headers: { "content-length": String(MAX_PHOTO_BYTES + 1) } }),
    );
    expect(await reason(downloadPhoto(url, { fetch: declared }))).toBe("size");

    // No content-length: chunks are counted as they arrive.
    const chunk = new Uint8Array(64);
    const streamed = vi.fn<FetchLike>(async () =>
      response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(chunk);
          },
        }),
      ),
    );
    expect(await reason(downloadPhoto(url, { fetch: streamed, maxBytes: 1000 }))).toBe("size");
    const small = vi.fn<FetchLike>(async () => response(new Uint8Array(1000)));
    expect((await downloadPhoto(url, { fetch: small, maxBytes: 1000 })).length).toBe(1000);
  });

  it("maps failed responses, network errors and the deadline", async () => {
    expect(await reason(downloadPhoto(url, { fetch: async () => response("gone", { status: 404 }) }))).toBe("status");
    expect(
      await reason(
        downloadPhoto(url, {
          fetch: async () => {
            throw new TypeError("fetch failed");
          },
        }),
      ),
    ).toBe("network");
    const hang: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    expect(await reason(downloadPhoto(url, { fetch: hang, timeoutMs: 20 }))).toBe("timeout");
  });
});

describe("processPhoto", () => {
  it("re-encodes a JPEG to the row's size, applying orientation and dropping metadata", async () => {
    const input = await jpeg(1200, 1800, { orientation: 6 });
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const output = await processPhoto(input, { width: 240, height: 160 });
    expect(output.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 240, height: 160 });
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("accepts WebP and refuses other real types, whatever the name", async () => {
    const webp = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: "#C9A96E" } })
      .webp()
      .toBuffer();
    expect((await sharp(await processPhoto(webp, { width: 48, height: 32 })).metadata()).format).toBe("jpeg");

    const png = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: "#C9A96E" } })
      .png()
      .toBuffer();
    await expect(processPhoto(png, { width: 48, height: 32 })).rejects.toMatchObject({ reason: "type" });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600"/>');
    await expect(processPhoto(svg, { width: 48, height: 32 })).rejects.toMatchObject({ reason: "type" });
  });

  it("refuses small and broken images", async () => {
    await expect(processPhoto(await jpeg(800, 600), { width: 48, height: 32 })).rejects.toMatchObject({
      reason: "size",
    });
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    await expect(processPhoto(broken, { width: 48, height: 32 })).rejects.toMatchObject({ reason: "decode" });
  });
});

describe("createPhotoProvider", () => {
  it("downloads a shared photo once and credits the photographer", async () => {
    const bytes = await jpeg(1500, 1000);
    const fetch = vi.fn<FetchLike>(async () => response(new Uint8Array(bytes)));
    const provider = createPhotoProvider({ fetch });
    const size = { width: 48, height: 32 };
    // Three Paris tours share one photo.
    const results = await Promise.all(
      ["seed-media-FR-PAR-03", "seed-media-FR-PAR-04", "seed-media-FR-PAR-05"].map((seed) =>
        provider.photoFor(sampleRow(seed), size),
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0].hostname).toBe("images.unsplash.com");
    for (const result of results) {
      expect(result).toMatchObject({ kind: "photo", credit: "Photo: Kevin Bessat / Unsplash" });
    }
  });

  it("answers none for rows without a photo or no longer credited as samples", async () => {
    const fetch = vi.fn<FetchLike>();
    const provider = createPhotoProvider({ fetch });
    const size = { width: 48, height: 32 };
    expect(await provider.photoFor(sampleRow("seed-media-VN-HLB-03", { credit: "Owner photo" }), size)).toEqual({
      kind: "none",
    });
    expect(
      await provider.photoFor(
        { ...sampleRow("x"), id: "00000000-0000-4000-8000-000000000009", alt: { en: "A quiet afternoon" } },
        size,
      ),
    ).toEqual({ kind: "none" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("matches only seed rows when asked to overwrite", async () => {
    const fetch = vi.fn<FetchLike>();
    const provider = createPhotoProvider({ fetch });
    const other = "5f0c2d1e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
    const row = sampleRow("x", { id: other, path: `2026/01/${other}.jpg`, alt: { en: "Paris" } });
    expect(await provider.photoFor(row, { width: 48, height: 32 }, { seedOnly: true })).toEqual({ kind: "none" });
    expect(provider.isSeedRow(row)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a failed photo once per key and answers failed", async () => {
    const onFailure = vi.fn();
    const fetch = vi.fn<FetchLike>(async () => {
      throw new TypeError("offline");
    });
    const provider = createPhotoProvider({ fetch, onFailure });
    const size = { width: 48, height: 32 };
    expect(await provider.photoFor(sampleRow("seed-media-FR-PAR-03"), size)).toEqual({ kind: "failed" });
    expect(await provider.photoFor(sampleRow("seed-media-FR-PAR-04"), size)).toEqual({ kind: "failed" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith("paris", "network");
  });
});

function fakeStore(rows: SampleRow[], existing: string[] = []) {
  return {
    listSampleRows: vi.fn(async () => rows),
    listExistingPaths: vi.fn(async () => new Set(existing)),
    upload: vi.fn<SeedStore["upload"]>(async () => "created"),
    replace: vi.fn<SeedStore["replace"]>(async () => true),
    updateRow: vi.fn<SeedStore["updateRow"]>(async () => true),
    remove: vi.fn<SeedStore["remove"]>(async () => undefined),
  } satisfies SeedStore;
}

describe("seedSampleMedia with photos", () => {
  const provider = (result: Awaited<ReturnType<PhotoProvider["photoFor"]>>) => ({
    photoFor: vi.fn<PhotoProvider["photoFor"]>(async () => result),
    isSeedRow,
  });
  const drawing = vi.fn(async () => sharp({ create: { width: 48, height: 32, channels: 3, background: "#0F1B2D" } }).jpeg().toBuffer());

  it("uploads the photo and sets the photographer's credit", async () => {
    const image = await jpeg(48, 32);
    const store = fakeStore([sampleRow("seed-media-VN-HLB-03")]);
    const counts = await seedSampleMedia(store, drawing, provider({ kind: "photo", image, credit: "Photo: A / Unsplash" }));
    expect(counts).toEqual({ created: 1, photos: 1, fallbacks: 0, skipped: 0, failed: 0 });
    expect(store.upload.mock.calls[0][1]).toBe(image);
    expect(store.updateRow.mock.calls[0][1]).toMatchObject({ size_bytes: image.length, credit: "Photo: A / Unsplash" });
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("falls back to the drawing and keeps the sample credit when the photo fails", async () => {
    drawing.mockClear();
    const store = fakeStore([sampleRow("seed-media-VN-HLB-03")]);
    const counts = await seedSampleMedia(store, drawing, provider({ kind: "failed" }));
    expect(counts).toEqual({ created: 1, photos: 0, fallbacks: 1, skipped: 0, failed: 0 });
    expect(drawing).toHaveBeenCalledTimes(1);
    expect(store.updateRow.mock.calls[0][1]).not.toHaveProperty("credit");
  });

  it("falls back when the provider throws, and draws rows without a photo", async () => {
    const store = fakeStore([sampleRow("seed-media-VN-HLB-03"), sampleRow("seed-post-kyoto")]);
    const throwing: PhotoProvider = {
      isSeedRow,
      photoFor: vi.fn(async (row: SampleRow) => {
        if (row.id === seedUuid("seed-post-kyoto")) return { kind: "none" as const };
        throw new Error("boom");
      }),
    };
    expect(await seedSampleMedia(store, drawing, throwing)).toEqual({
      created: 2,
      photos: 0,
      fallbacks: 1,
      skipped: 0,
      failed: 0,
    });
  });

  it("replaces an earlier drawing on a seed row in one upsert, only once a photo is in hand", async () => {
    const photoImage = await jpeg(48, 32);
    const row = sampleRow("seed-media-VN-HLB-03");
    const replaced = fakeStore([row], [row.path]);
    const photos = provider({ kind: "photo", image: photoImage, credit: "Photo: A / Unsplash" });
    expect(await seedSampleMedia(replaced, drawing, photos)).toEqual({
      created: 1,
      photos: 1,
      fallbacks: 0,
      skipped: 0,
      failed: 0,
    });
    expect(photos.photoFor.mock.calls[0][2]).toEqual({ seedOnly: true });
    expect(replaced.replace).toHaveBeenCalledWith(row.path, photoImage, "image/jpeg");
    expect(replaced.remove).not.toHaveBeenCalled();
    expect(replaced.upload).not.toHaveBeenCalled();
    expect(replaced.updateRow.mock.calls[0][1]).toMatchObject({ credit: "Photo: A / Unsplash" });

    const kept = fakeStore([row], [row.path]);
    expect(await seedSampleMedia(kept, drawing, provider({ kind: "failed" }))).toEqual({
      created: 0,
      photos: 0,
      fallbacks: 1,
      skipped: 1,
      failed: 0,
    });
    expect(kept.replace).not.toHaveBeenCalled();
    expect(kept.remove).not.toHaveBeenCalled();
    expect(kept.upload).not.toHaveBeenCalled();
  });

  it("keeps the earlier drawing when the overwrite fails, and the file when the row update fails", async () => {
    const photoImage = await jpeg(48, 32);
    const row = sampleRow("seed-media-VN-HLB-03");
    const photos = provider({ kind: "photo", image: photoImage, credit: "Photo: A / Unsplash" });
    const refused = fakeStore([row], [row.path]);
    refused.replace.mockResolvedValueOnce(false);
    expect(await seedSampleMedia(refused, drawing, photos)).toMatchObject({ created: 0, failed: 1 });
    expect(refused.updateRow).not.toHaveBeenCalled();
    expect(refused.remove).not.toHaveBeenCalled();

    const changed = fakeStore([row], [row.path]);
    changed.updateRow.mockResolvedValueOnce(false);
    expect(await seedSampleMedia(changed, drawing, photos)).toMatchObject({ created: 0, failed: 1 });
    expect(changed.remove).not.toHaveBeenCalled();
  });

  it("never overwrites an existing object on a row the seed did not create", async () => {
    // An editor's upload: the same path shape, credited "Sample image" by hand, a matching alt.
    const ownerId = "5f0c2d1e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
    const owner = sampleRow("x", { id: ownerId, path: `2026/03/${ownerId}.jpg`, alt: { en: "Paris at dusk", vi: "Paris" } });
    // A seed id whose path is not the seed's.
    const moved = sampleRow("seed-media-FR-PAR-03", { path: `2026/05/${seedUuid("seed-media-FR-PAR-03")}.jpg` });
    const store = fakeStore([owner, moved], [owner.path, moved.path]);
    const photos = provider({ kind: "photo", image: await jpeg(48, 32), credit: "Photo: A / Unsplash" });
    expect(await seedSampleMedia(store, drawing, photos)).toEqual({
      created: 0,
      photos: 0,
      fallbacks: 0,
      skipped: 2,
      failed: 0,
    });
    expect(photos.photoFor).not.toHaveBeenCalled();
    expect(store.replace).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
    expect(store.upload).not.toHaveBeenCalled();
    expect(store.updateRow).not.toHaveBeenCalled();
  });

  it("never asks for a photo for rows that are not sample rows or not JPEG", async () => {
    const photoImage = await jpeg(48, 32);
    const photos = provider({ kind: "photo", image: photoImage, credit: "Photo: A / Unsplash" });
    const store = fakeStore([
      sampleRow("seed-media-VN-HLB-03", { credit: "Owner photo" }),
      sampleRow("seed-media-FR-PAR-03", { mime_type: "image/png", path: `2026/01/${seedUuid("seed-media-FR-PAR-03")}.png` }),
    ]);
    expect(await seedSampleMedia(store, drawing, photos)).toMatchObject({ created: 1, photos: 0 });
    expect(photos.photoFor).not.toHaveBeenCalled();
  });
});

describe("createSupabaseStore replace", () => {
  it("overwrites in one upload call with a short cache", async () => {
    const bucket = { upload: vi.fn(async () => ({ data: null, error: null })) };
    const client = { from: vi.fn(), storage: { from: vi.fn(() => bucket) } };
    const body = Buffer.from("x");
    expect(await createSupabaseStore(client as never).replace("2026/01/a.jpg", body, "image/jpeg")).toBe(true);
    expect(bucket.upload).toHaveBeenCalledWith("2026/01/a.jpg", body, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "60",
    });
    bucket.upload.mockResolvedValueOnce({ data: null, error: { message: "denied" } } as never);
    expect(await createSupabaseStore(client as never).replace("2026/01/a.jpg", body, "image/jpeg")).toBe(false);
  });
});

describe("createSupabaseStore with a credit", () => {
  it("writes the credit but still matches the row by id, bucket and the sample credit", async () => {
    const filters: Array<[string, unknown]> = [];
    const query = {
      update: vi.fn(() => query),
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => resolve({ data: [{ id: "a" }], error: null }),
    };
    const client = { from: vi.fn(() => query), storage: { from: vi.fn(() => ({})) } };
    const values = { size_bytes: 10, blur_data_url: "data:image/webp;base64,AA==", credit: "Photo: A / Unsplash" };
    expect(await createSupabaseStore(client as never).updateRow("a", values)).toBe(true);
    expect(query.update).toHaveBeenCalledWith(values);
    expect(query.select).toHaveBeenCalledWith("id");
    expect(filters).toEqual([
      ["id", "a"],
      ["bucket", "media"],
      ["credit", SAMPLE_CREDIT],
    ]);
  });
});
