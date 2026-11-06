import { describe, expect, it } from "vitest";

import { detectImageKind } from "./media.sniff";

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(
    values.flatMap((value) => (typeof value === "string" ? [...value].map((c) => c.charCodeAt(0)) : [value])),
  );

describe("detectImageKind", () => {
  it("recognises JPEG, PNG, WebP and AVIF by their signatures", () => {
    expect(detectImageKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(detectImageKind(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13))).toBe("png");
    expect(detectImageKind(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("webp");
    expect(detectImageKind(bytes(0, 0, 0, 0x1c, "ftyp", "avif", 0, 0, 0, 0, "mif1", "miaf"))).toBe("avif");
    expect(detectImageKind(bytes(0, 0, 0, 0x1c, "ftyp", "mif1", 0, 0, 0, 0, "avif", "miaf"))).toBe("avif");
  });

  it("rejects SVG, HEIC, GIF, scripts and truncated files whatever their name", () => {
    expect(detectImageKind(bytes("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
    expect(detectImageKind(bytes("<?xml version='1.0'?><svg>"))).toBeNull();
    expect(detectImageKind(bytes(0, 0, 0, 0x18, "ftyp", "heic", 0, 0, 0, 0, "mif1", "heic"))).toBeNull();
    expect(detectImageKind(bytes("GIF89a"))).toBeNull();
    expect(detectImageKind(bytes("#!/bin/sh\nrm -rf /"))).toBeNull();
    expect(detectImageKind(bytes(0xff, 0xd8))).toBeNull();
    expect(detectImageKind(new Uint8Array())).toBeNull();
  });
});
