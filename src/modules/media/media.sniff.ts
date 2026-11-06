/**
 * Detects the real image type from a file's first bytes (docs/specs/phase-2-catalog-admin.md
 * decision 6). The browser's MIME type and the file extension are never trusted: an SVG or a
 * script renamed to .jpg is rejected here.
 */
export type ImageKind = "jpeg" | "png" | "webp" | "avif";

export const IMAGE_MIME: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export const IMAGE_EXTENSION: Record<ImageKind, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
};

/** Bytes needed to recognise every supported type. */
export const SNIFF_BYTES = 32;

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) {
    return "png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  // ISO-BMFF: [size][ftyp][major brand]…[compatible brands]; AVIF uses avif/avis.
  if (bytes.length >= 16 && ascii(bytes, 4, 8) === "ftyp") {
    const boxSize = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    const end = Math.min(bytes.length, Math.max(16, boxSize));
    for (let offset = 8; offset + 4 <= end; offset += 4) {
      if (offset === 12) continue; // minor version, not a brand
      const brand = ascii(bytes, offset, offset + 4);
      if (brand === "avif" || brand === "avis") return "avif";
    }
  }
  return null;
}
