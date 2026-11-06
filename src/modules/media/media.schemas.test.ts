import { describe, expect, it } from "vitest";

import {
  createUploadSchema,
  finalizeUploadSchema,
  isSmall,
  kindMatchesExtension,
  readAlt,
  sanitizeSearch,
} from "./media.schemas";

describe("media schemas", () => {
  it("accepts supported images up to 20 MB only", () => {
    expect(createUploadSchema.safeParse({ fileName: "a.jpg", size: 1000, contentType: "image/jpeg" }).success).toBe(true);
    expect(createUploadSchema.safeParse({ fileName: "a.svg", size: 1000, contentType: "image/svg+xml" }).success).toBe(false);
    expect(createUploadSchema.safeParse({ fileName: "a.gif", size: 1000, contentType: "image/gif" }).success).toBe(false);
    expect(
      createUploadSchema.safeParse({ fileName: "a.jpg", size: 20 * 1024 * 1024 + 1, contentType: "image/jpeg" }).success,
    ).toBe(false);
    expect(createUploadSchema.safeParse({ fileName: "a.jpg", size: 0, contentType: "image/jpeg" }).success).toBe(false);
  });

  it("only finalizes server-generated paths", () => {
    const ok = "2026/11/0f8fad5b-d9cb-469f-a165-70867728950e.jpg";
    expect(finalizeUploadSchema.safeParse({ path: ok }).success).toBe(true);
    for (const path of ["../2026/11/x.jpg", "2026/11/0f8fad5b-d9cb-469f-a165-70867728950e.svg", "private/x.jpg", `${ok}/..`]) {
      expect(finalizeUploadSchema.safeParse({ path }).success, path).toBe(false);
    }
  });

  it("checks that the real type matches the stored extension", () => {
    expect(kindMatchesExtension("jpeg", "2026/11/x.jpg")).toBe(true);
    expect(kindMatchesExtension("png", "2026/11/x.jpg")).toBe(false);
  });

  it("strips PostgREST filter syntax from searches", () => {
    expect(sanitizeSearch("hạ long,path.eq.x)(*")).toBe("hạ long path.eq.x");
  });

  it("reads alt text defensively and flags small images", () => {
    expect(readAlt(null)).toEqual({ vi: "", en: "" });
    expect(readAlt({ vi: "Vịnh", en: 3 })).toEqual({ vi: "Vịnh", en: "" });
    expect(isSmall(1600, 1067)).toBe(true);
    expect(isSmall(2400, 1600)).toBe(false);
    expect(isSmall(null, null)).toBe(false);
  });
});
