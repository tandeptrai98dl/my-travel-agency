import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions: Zod first, then the service; a refused permission becomes "forbidden".
const { AccessDeniedError, service } = vi.hoisted(() => {
  class AccessDeniedError extends Error {}
  return {
    AccessDeniedError,
    service: {
      createUpload: vi.fn(),
      finalizeUpload: vi.fn(),
      updateMedia: vi.fn(),
      deleteMedia: vi.fn(),
      listMedia: vi.fn(),
    },
  };
});
vi.mock("@/lib/auth/require-role", () => ({ AccessDeniedError }));
vi.mock("./media.service", () => service);

const actions = await import("./media.actions");

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const STAGED = `pending/00000000-0000-4000-8000-000000000014/${ID}.jpg`;

const calls: [string, () => Promise<unknown>, keyof typeof service][] = [
  ["startMediaUpload", () => actions.startMediaUpload({ fileName: "a.jpg", size: 10, contentType: "image/jpeg" }), "createUpload"],
  ["completeMediaUpload", () => actions.completeMediaUpload({ path: STAGED, fileName: "a.jpg" }), "finalizeUpload"],
  ["saveMediaDetails", () => actions.saveMediaDetails({ id: ID, alt: { vi: "a", en: "b" }, credit: null }), "updateMedia"],
  ["removeMedia", () => actions.removeMedia({ id: ID }), "deleteMedia"],
  ["browseMedia", () => actions.browseMedia({ q: "", page: 1 }), "listMedia"],
];

beforeEach(() => vi.resetAllMocks());

describe("media actions", () => {
  it.each(calls)("%s returns forbidden when the role check refuses", async (_name, call, fn) => {
    service[fn].mockRejectedValue(new AccessDeniedError("denied"));
    expect(await call()).toEqual({ ok: false, error: "forbidden" });
  });

  it("rethrows unexpected errors", async () => {
    service.deleteMedia.mockRejectedValue(new Error("boom"));
    await expect(actions.removeMedia({ id: ID })).rejects.toThrow("boom");
  });

  it("validates input before calling the service", async () => {
    expect(await actions.completeMediaUpload({ path: `2026/11/${ID}.jpg`, fileName: "a.jpg" })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await actions.removeMedia({ id: "not-a-uuid" })).toEqual({ ok: false, error: "invalid" });
    service.listMedia.mockResolvedValue({ items: [], total: 0, pageCount: 1 });
    // Bad list parameters fall back to defaults (`.catch()`), like the media page URL.
    expect(await actions.browseMedia({ q: 5 })).toMatchObject({ ok: true });
    expect(service.listMedia).toHaveBeenCalledWith({ q: "", page: 1 });
    expect(service.finalizeUpload).not.toHaveBeenCalled();
    expect(service.deleteMedia).not.toHaveBeenCalled();
  });
});
