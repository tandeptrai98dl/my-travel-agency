/**
 * Real sample photos for `npm run seed:media -- --photos` (local development and demos only).
 *
 * No image file is committed. This manifest lists free photos from Unsplash, each checked by hand
 * on its photo page (photographer and "Free to use under the Unsplash License"; never Unsplash+),
 * and maps every `Sample image` row of `supabase/seed.sql` to one of them. On the owner's machine
 * the runner downloads each photo once, from an https allow-list of image hosts, and sends it
 * through the same checks as an admin upload (ADR-023): real type from the first bytes, size,
 * dimension and pixel limits, then a re-encode (orientation applied, metadata dropped) to the
 * row's 2400 × 1600 JPEG. The row's credit becomes `Photo: <author> / Unsplash`. Anything that
 * fails (offline, a moved photo, a refused redirect, a bad file) falls back to the generated
 * drawing for that row and keeps `Sample image`, so a later `--photos` run retries it.
 *
 * Licence: the Unsplash License allows free use, including commercial use, without permission;
 * it does not allow compiling the photos into a competing service, and it gives no rights in
 * people, brands or artworks that appear in them. These photos only stand in for content during
 * development and demos. For production the owner uploads their own photography through
 * `/admin/media`, with VI/EN alt text and their own credit.
 */
import { createHash } from "node:crypto";

import sharp from "sharp";

import { detectImageKind } from "../../src/modules/media/media.sniff.ts";
import { altText, SAMPLE_CREDIT, type PhotoProvider, type PhotoResult, type SampleRow } from "./seed-media.ts";

sharp.cache(false);

// ---------------------------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------------------------

export type PhotoSource = "Unsplash" | "Pexels";

export type SeedPhoto = {
  key: string;
  /** Normalised words (no diacritics) that pick this photo for a sample row the table below misses. */
  keywords: readonly string[];
  pageUrl: string;
  downloadUrl: string;
  author: string;
  source: PhotoSource;
  licence: "Unsplash License" | "Pexels License";
};

/** `w=2400` asks the CDN for the brand's long-edge size (never upscaled by the CDN). */
const unsplash = (id: string, photo: string) => ({
  pageUrl: `https://unsplash.com/photos/${id}`,
  downloadUrl: `https://images.unsplash.com/${photo}?w=2400&q=85&fm=jpg&fit=max`,
  source: "Unsplash" as const,
  licence: "Unsplash License" as const,
});

/** Checked on each photo page on 2026-11-09. */
export const SEED_PHOTOS: readonly SeedPhoto[] = [
  {
    key: "ha-long-bay",
    keywords: ["ha long", "halong", "lan ha", "vinh"],
    author: "Vincent Guth",
    ...unsplash("3sR_0NhWMEI", "photo-1487548919775-a7a460f3cbe6"),
  },
  {
    key: "ha-long-boat",
    keywords: ["limestone", "da voi", "boat", "thuyen"],
    author: "Fré Sonneveld",
    ...unsplash("W2KEyYAAvU4", "photo-1431975071466-2c609dac5956"),
  },
  {
    key: "sapa-terraces",
    keywords: ["sa pa", "sapa", "terraces", "bac thang"],
    author: "Nguyen The Hung",
    ...unsplash("_iWF0PDZNgo", "photo-1649531437455-c2f42105650f"),
  },
  {
    key: "mu-cang-chai",
    keywords: ["mu cang chai", "terraced", "nuoc do"],
    author: "Vu Thang",
    ...unsplash("0CaHnK7PVCo", "photo-1733372607228-6aeaa92c5e62"),
  },
  {
    key: "hue",
    keywords: ["hue", "hoi an", "heritage", "di san"],
    author: "lovebyLouis",
    ...unsplash("Q380ubsHom8", "photo-1722929176497-b627b5980d79"),
  },
  {
    key: "phu-quoc",
    keywords: ["phu quoc", "beach", "bien", "wellness", "nghi duong"],
    author: "Hai Dang Le",
    ...unsplash("WNvS1zE_mCg", "photo-1767553669090-6c21addbf523"),
  },
  {
    key: "kyoto-autumn",
    keywords: ["maple", "phong", "autumn", "la do"],
    author: "YANGHONG YU",
    ...unsplash("Js6qBaTNrl4", "photo-1669002231665-a4493eb47702"),
  },
  {
    key: "kyoto-temple",
    keywords: ["kyoto", "tokyo", "osaka", "japan", "nhat ban"],
    author: "Bradrey Nassel",
    ...unsplash("HwEflWHYy34", "photo-1733367240221-13242a6543c4"),
  },
  {
    key: "paris",
    keywords: ["paris", "versailles", "museums", "bao tang"],
    author: "Kevin Bessat",
    ...unsplash("s68juqYE6PE", "photo-1758002253582-fbebc2341503"),
  },
  {
    key: "provence-lavender",
    keywords: ["lavender", "oai huong"],
    author: "Parrish Freeman",
    ...unsplash("FBFwc-ZV408", "photo-1735653279088-c906bb6dc362"),
  },
  {
    key: "provence-fields",
    keywords: ["provence"],
    author: "Polina Silivanova",
    ...unsplash("3hrHxkxRORY", "photo-1657463193799-b73a73c567f8"),
  },
  {
    key: "provence-village",
    keywords: ["hill villages", "lang da", "france", "phap"],
    author: "Yefim Vedernikoff",
    ...unsplash("kN3sR13mrks", "photo-1766382787028-910d18f4a60f"),
  },
  {
    key: "avignon",
    keywords: ["avignon", "rhone"],
    author: "Boudewijn Huysmans",
    ...unsplash("zuR07RbtjiY", "photo-1782020983335-a721ec206f42"),
  },
  {
    key: "avignon-palace",
    keywords: [],
    author: "Elly Ch.",
    ...unsplash("PThOYsBZc_U", "photo-1703796792174-621d9c8ab0bc"),
  },
  {
    key: "bangkok-wat-arun",
    keywords: ["bangkok", "ayutthaya"],
    author: "Viktor Solomonik",
    ...unsplash("3HIOgpw0Jn4", "photo-1757476622860-11d782f83635"),
  },
  {
    key: "bangkok-loha-prasat",
    keywords: ["thailand", "thai lan"],
    author: "Alejandro Cartagena",
    ...unsplash("B64B6-kAWlw", "photo-1563492065599-3520f775eeed"),
  },
  {
    key: "doi-inthanon",
    keywords: ["inthanon", "mountain temples", "chua tren nui", "northern thailand", "bac thai lan"],
    author: "Bharath Mohan",
    ...unsplash("JHZye99eeaU", "photo-1512553840337-276c0d80a43a"),
  },
  {
    key: "chiang-mai",
    keywords: ["chiang mai"],
    author: "Nopparuj Lamaikul",
    ...unsplash("sZicNHRV404", "photo-1714240230125-531572031bbf"),
  },
];

/** In `SEED_ROW_PHOTOS`: keep the generated drawing for that row on purpose. */
export const DRAWING = "drawing";

/**
 * Every `Sample image` row of `supabase/seed.sql`, by the text its id is made from
 * (`pg_temp.seed_uuid('seed-media-' || code)` for tour heroes, `'seed-post-' || key` for journal
 * covers). A unit test keeps this list equal to the seed. Several tours of one place share a photo.
 */
export const SEED_ROW_PHOTOS: Readonly<Record<string, string>> = {
  // Tour heroes (the first six tours)
  "seed-media-VN-HLB-03": "ha-long-bay",
  "seed-media-VN-NTH-06": "sapa-terraces",
  "seed-media-VN-HER-05": "hue",
  "seed-media-JP-KYT-07": "kyoto-temple",
  "seed-media-FR-PRV-09": "provence-lavender",
  "seed-media-VN-PQC-04": "phu-quoc",
  // Tour heroes (the listing sample)
  "seed-media-TH-BKK-02": "bangkok-loha-prasat",
  "seed-media-TH-BKK-03": "bangkok-wat-arun",
  "seed-media-TH-BKK-04": "bangkok-loha-prasat",
  "seed-media-TH-CNX-04": "chiang-mai",
  "seed-media-TH-CNX-05": "doi-inthanon",
  "seed-media-TH-CNX-06": "chiang-mai",
  "seed-media-TH-NTH-07": "doi-inthanon",
  "seed-media-TH-BKK-08": "bangkok-loha-prasat",
  "seed-media-TH-CNX-09": "doi-inthanon",
  "seed-media-TH-BKK-10": "bangkok-wat-arun",
  "seed-media-TH-TH-12": "chiang-mai",
  "seed-media-TH-TH-15": "bangkok-wat-arun",
  "seed-media-TH-TH-18": "doi-inthanon",
  "seed-media-FR-PAR-03": "paris",
  "seed-media-FR-PAR-04": "paris",
  "seed-media-FR-PAR-05": "paris",
  "seed-media-FR-PAR-06": "paris",
  "seed-media-FR-PAR-07": "paris",
  "seed-media-FR-AVN-06": "avignon",
  "seed-media-FR-PRO-07": "provence-fields",
  "seed-media-FR-PRO-08": "provence-village",
  "seed-media-FR-FR-09": "avignon-palace",
  "seed-media-FR-FR-10": "provence-village",
  "seed-media-FR-FR-12": "provence-fields",
  "seed-media-FR-FR-14": "paris",
  "seed-media-FR-FR-16": "provence-lavender",
  // Journal covers
  "seed-post-ha-long": "ha-long-boat",
  "seed-post-kyoto": "kyoto-autumn",
  "seed-post-provence": "provence-lavender",
  "seed-post-scheduled": "mu-cang-chai",
};

/** `pg_temp.seed_uuid()` of `supabase/seed.sql`: an md5 hex shaped as a version-4 UUID. */
export function seedUuid(seed: string): string {
  const h = createHash("md5").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const PHOTOS_BY_KEY = new Map(SEED_PHOTOS.map((photo) => [photo.key, photo]));
const CHOICE_BY_ID = new Map(Object.entries(SEED_ROW_PHOTOS).map(([seed, choice]) => [seedUuid(seed), choice]));

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A row `supabase/seed.sql` created: a seed id from `SEED_ROW_PHOTOS` in the `media` bucket at the
 * seed's own path (`2026/01/<id>.jpg`). Only such rows may have an existing object overwritten:
 * admin uploads use the same path shape, and an editor can type any credit, `Sample image` too.
 */
export function isSeedRow(row: Pick<SampleRow, "id" | "bucket" | "path">): boolean {
  return CHOICE_BY_ID.has(row.id) && row.bucket === "media" && row.path === `2026/01/${row.id}.jpg`;
}

/**
 * The photo for a sample row: by its seeded id first, else (unless `seedOnly`) the first photo with
 * a keyword in the row's alt text (either language), else none (the drawing).
 */
export function photoForRow(
  row: Pick<SampleRow, "id" | "alt">,
  options: { seedOnly?: boolean } = {},
): SeedPhoto | null {
  const choice = CHOICE_BY_ID.get(row.id.toLowerCase());
  if (choice !== undefined) return choice === DRAWING ? null : (PHOTOS_BY_KEY.get(choice) ?? null);
  if (options.seedOnly) return null;
  const text = altText(row.alt);
  if (!text) return null;
  for (const photo of SEED_PHOTOS) {
    if (photo.keywords.some((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`).test(text))) return photo;
  }
  return null;
}

/** `Photo: <author> / Unsplash`; never the sample credit, so a later run leaves the row alone. */
export function creditFor(photo: Pick<SeedPhoto, "author" | "source">): string {
  const author = photo.author.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return `Photo: ${author || "Unknown"} / ${photo.source}`;
}

// ---------------------------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------------------------

/** Image hosts a photo may come from, also after a redirect. */
export const PHOTO_HOSTS: ReadonlySet<string> = new Set(["images.unsplash.com", "unsplash.com", "images.pexels.com"]);
/** The `media` bucket's limit, as for admin uploads (`MAX_UPLOAD_BYTES`). */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const PHOTO_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

/** Why a photo was not used; printed with its key, never with a URL. */
export type PhotoFailure = "url" | "redirect" | "status" | "size" | "timeout" | "network" | "type" | "decode";

export class PhotoError extends Error {
  readonly reason: PhotoFailure;
  constructor(reason: PhotoFailure) {
    super(`photo unavailable: ${reason}`);
    this.reason = reason;
  }
}

/** https only, one of `PHOTO_HOSTS`, the default port, no user name or password. */
export function isAllowedPhotoUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    PHOTO_HOSTS.has(url.hostname.toLowerCase()) &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  );
}

export type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new PhotoError("size");
  }
  if (!response.body) throw new PhotoError("network");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PhotoError("size");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Downloads one photo into memory: https from `PHOTO_HOSTS` only, redirects followed by hand and
 * only within those hosts, at most `maxBytes`, one deadline for the whole download.
 */
export async function downloadPhoto(
  url: string,
  options: { fetch?: FetchLike; timeoutMs?: number; maxBytes?: number } = {},
): Promise<Buffer> {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const signal = AbortSignal.timeout(options.timeoutMs ?? PHOTO_TIMEOUT_MS);
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new PhotoError("url");
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isAllowedPhotoUrl(current)) throw new PhotoError(hop === 0 ? "url" : "redirect");
    let response: Response;
    try {
      response = await fetchImpl(current, {
        redirect: "manual",
        signal,
        headers: { accept: "image/jpeg,image/webp;q=0.9" },
      });
    } catch {
      throw new PhotoError(signal.aborted ? "timeout" : "network");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new PhotoError("redirect");
      try {
        current = new URL(location, current);
      } catch {
        throw new PhotoError("redirect");
      }
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new PhotoError("status");
    }
    try {
      return await readCapped(response, options.maxBytes ?? MAX_PHOTO_BYTES);
    } catch (error) {
      if (error instanceof PhotoError) throw error;
      throw new PhotoError(signal.aborted ? "timeout" : "network");
    }
  }
  throw new PhotoError("redirect");
}

// ---------------------------------------------------------------------------------------------
// Check and re-encode (the media service's rules, ADR-023)
// ---------------------------------------------------------------------------------------------

/** `MAX_DIMENSION` and `MAX_PIXELS` of `src/modules/media/media.schemas.ts` (a test keeps them equal). */
export const PHOTO_MAX_DIMENSION = 12_000;
export const PHOTO_MAX_PIXELS = 50_000_000;
/** Below this the cover crop would upscale a lot; the drawing looks better than a blurry photo. */
export const PHOTO_MIN_WIDTH = 1200;
export const PHOTO_MIN_HEIGHT = 800;

/**
 * The downloaded bytes as the row's JPEG: the real type must be JPEG or WebP, the size and pixel
 * count within the media limits; orientation is applied, the image cropped to cover the row's
 * size and re-encoded at quality 82 like the drawings, with no metadata kept.
 */
export async function processPhoto(bytes: Buffer, size: { width: number; height: number }): Promise<Buffer> {
  const kind = detectImageKind(bytes.subarray(0, 32));
  if (kind !== "jpeg" && kind !== "webp") throw new PhotoError("type");
  const options = { limitInputPixels: PHOTO_MAX_PIXELS, failOn: "error" as const };
  let width: number;
  let height: number;
  try {
    const meta = await sharp(bytes, options).metadata();
    if (meta.format !== kind) throw new PhotoError("type");
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError("decode");
  }
  if (width > PHOTO_MAX_DIMENSION || height > PHOTO_MAX_DIMENSION || width * height > PHOTO_MAX_PIXELS) {
    throw new PhotoError("size");
  }
  // Compared before rotation; a portrait photo still has to be wide enough once turned.
  if (Math.max(width, height) < PHOTO_MIN_WIDTH || Math.min(width, height) < PHOTO_MIN_HEIGHT) {
    throw new PhotoError("size");
  }
  try {
    return await sharp(bytes, options)
      .rotate()
      .resize(size.width, size.height, { fit: "cover", position: sharp.strategy.attention })
      .flatten({ background: "#0F1B2D" })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer();
  } catch {
    throw new PhotoError("decode");
  }
}

// ---------------------------------------------------------------------------------------------
// Provider for `seedSampleMedia()`
// ---------------------------------------------------------------------------------------------

export type PhotoProviderOptions = {
  fetch?: FetchLike;
  timeoutMs?: number;
  /** Called once per photo key that could not be used (the runner prints the key and reason). */
  onFailure?: (key: string, reason: PhotoFailure) => void;
};

/**
 * Downloads each photo once per run (rows of the same place share it) and re-encodes it per size.
 * Everything stays in memory; nothing is written to disk.
 */
export function createPhotoProvider(options: PhotoProviderOptions = {}): PhotoProvider {
  const downloads = new Map<string, Promise<Buffer>>();
  const encoded = new Map<string, Promise<Buffer>>();
  const reported = new Set<string>();

  function report(key: string, error: unknown) {
    if (reported.has(key)) return;
    reported.add(key);
    options.onFailure?.(key, error instanceof PhotoError ? error.reason : "decode");
  }

  return {
    isSeedRow,
    async photoFor(row, size, lookup = {}): Promise<PhotoResult> {
      if (row.credit !== SAMPLE_CREDIT) return { kind: "none" };
      if (lookup.seedOnly && !isSeedRow(row)) return { kind: "none" };
      const photo = photoForRow(row, lookup);
      if (!photo) return { kind: "none" };
      let download = downloads.get(photo.key);
      if (!download) {
        download = downloadPhoto(photo.downloadUrl, { fetch: options.fetch, timeoutMs: options.timeoutMs });
        downloads.set(photo.key, download);
      }
      const sizeKey = `${photo.key}:${size.width}x${size.height}`;
      let image = encoded.get(sizeKey);
      if (!image) {
        image = download.then((bytes) => processPhoto(bytes, size));
        encoded.set(sizeKey, image);
      }
      try {
        return { kind: "photo", image: await image, credit: creditFor(photo) };
      } catch (error) {
        report(photo.key, error);
        return { kind: "failed" };
      }
    },
  };
}
