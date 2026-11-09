import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import {
  blurDataUrl,
  checkTarget,
  chooseScene,
  createSupabaseStore,
  generateSampleImage,
  normaliseText,
  PALETTES,
  sampleSvg,
  type SampleRow,
  SAMPLE_CREDIT,
  type SeedStore,
  seedSampleMedia,
} from "../../../scripts/lib/seed-media";

/** `media_blur_data_url_webp` in `20261106145000_media_uploads_bucket.sql`. */
const BLUR_CHECK = /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/;

function id(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

describe("checkTarget", () => {
  const local = "http://127.0.0.1:54321";

  it("accepts local hosts", () => {
    expect(checkTarget({ url: local, allowRemote: undefined, vercelEnv: undefined })).toEqual({
      ok: true,
      host: "127.0.0.1",
    });
    expect(checkTarget({ url: "http://localhost:54321", allowRemote: undefined, vercelEnv: "development" }).ok).toBe(
      true,
    );
  });

  it("refuses a remote host unless --allow-remote names it exactly", () => {
    const url = "https://abcd1234.supabase.co";
    expect(checkTarget({ url, allowRemote: undefined, vercelEnv: undefined }).ok).toBe(false);
    expect(checkTarget({ url, allowRemote: "other.supabase.co", vercelEnv: undefined }).ok).toBe(false);
    expect(checkTarget({ url, allowRemote: "abcd1234.supabase.co", vercelEnv: "preview" }).ok).toBe(true);
  });

  it("always refuses VERCEL_ENV=production", () => {
    expect(checkTarget({ url: local, allowRemote: undefined, vercelEnv: "production" }).ok).toBe(false);
    expect(
      checkTarget({
        url: "https://abcd1234.supabase.co",
        allowRemote: "abcd1234.supabase.co",
        vercelEnv: "production",
      }).ok,
    ).toBe(false);
  });

  it("compares VERCEL_ENV without regard to case", () => {
    expect(checkTarget({ url: local, allowRemote: undefined, vercelEnv: "Production" }).ok).toBe(false);
    expect(checkTarget({ url: local, allowRemote: undefined, vercelEnv: " PRODUCTION " }).ok).toBe(false);
  });

  it("refuses a Supabase host listed in PRODUCTION_HOSTS, even with --allow-remote", () => {
    const url = "https://prodref.supabase.co";
    const productionHosts = "www.example.vn, PRODREF.supabase.co., prod-db.upstash.io";
    expect(checkTarget({ url, allowRemote: "prodref.supabase.co", vercelEnv: undefined, productionHosts })).toEqual({
      ok: false,
      message: expect.stringContaining("PRODUCTION_HOSTS"),
    });
    expect(
      checkTarget({ url: "https://prodref.supabase.co./", allowRemote: "prodref.supabase.co", vercelEnv: undefined, productionHosts })
        .ok,
    ).toBe(false);
    // A staging host that is not listed still works with --allow-remote; an empty list changes nothing.
    expect(
      checkTarget({ url: "https://stagingref.supabase.co", allowRemote: "stagingref.supabase.co", vercelEnv: undefined, productionHosts })
        .ok,
    ).toBe(true);
    expect(checkTarget({ url: local, allowRemote: undefined, vercelEnv: undefined, productionHosts: " , " }).ok).toBe(true);
  });

  it("refuses a missing or malformed URL", () => {
    expect(checkTarget({ url: undefined, allowRemote: undefined, vercelEnv: undefined }).ok).toBe(false);
    expect(checkTarget({ url: "not a url", allowRemote: undefined, vercelEnv: undefined }).ok).toBe(false);
  });
});

describe("chooseScene", () => {
  it("normalises Vietnamese text", () => {
    expect(normaliseText("Đường mòn Doi Inthanon")).toBe("duong mon doi inthanon");
    expect(normaliseText("Vịnh Hạ Long")).toBe("vinh ha long");
  });

  it("picks the scene from keywords in either language", () => {
    expect(chooseScene(id(1), { vi: "Du thuyền vịnh Hạ Long", en: "Ha Long Bay Cruise" })).toMatchObject({
      scene: "water",
      variant: "karst",
    });
    expect(chooseScene(id(2), { vi: "Ruộng bậc thang mùa nước đổ" }).scene).toBe("hills");
    expect(chooseScene(id(2), { en: "Terraced fields in the flooding season" }).scene).toBe("hills");
    expect(chooseScene(id(3), { en: "Sapa rice terraces" }).scene).toBe("hills");
    expect(chooseScene(id(4), { en: "Red maple leaves over a temple roof in Kyoto" })).toMatchObject({
      scene: "city",
      variant: "temple",
    });
    expect(chooseScene(id(5), { vi: "Paris và lâu đài Versailles" })).toMatchObject({
      scene: "city",
      variant: "skyline",
    });
    expect(chooseScene(id(6), { vi: "Cánh đồng oải hương xứ Provence" }).scene).toBe("fields");
  });

  it("is deterministic from the id and varies the palette across ids", () => {
    const alt = { en: "Fifteen days in Thailand" };
    expect(chooseScene(id(7), alt)).toEqual(chooseScene(id(7), alt));
    const palettes = new Set(Array.from({ length: 40 }, (_, n) => chooseScene(id(n), alt).palette.name));
    const scenes = new Set(Array.from({ length: 40 }, (_, n) => chooseScene(id(n), alt).scene));
    expect(palettes.size).toBeGreaterThan(2);
    expect(scenes.size).toBeGreaterThan(1);
    expect([...palettes].every((name) => PALETTES.some((palette) => palette.name === name))).toBe(true);
  });

  it("draws the same SVG for the same id, a different one for another, never with text", () => {
    const input = { alt: { en: "Ha Long Bay" }, width: 240, height: 160 };
    const a = sampleSvg({ id: id(8), ...input });
    expect(sampleSvg({ id: id(8), ...input })).toBe(a);
    expect(sampleSvg({ id: id(9), ...input })).not.toBe(a);
    for (let n = 0; n < 20; n += 1) {
      const svg = sampleSvg({ id: id(n), alt: {}, width: 240, height: 160 });
      expect(svg).not.toMatch(/<text|<image|href=/);
    }
  });
});

describe("generateSampleImage", () => {
  it("returns a JPEG of the requested size, the same bytes for the same id", async () => {
    const input = { id: id(10), alt: { en: "A lavender field in Provence" }, width: 120, height: 80 };
    const image = await generateSampleImage(input);
    expect(image.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    const meta = await sharp(image).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 120, height: 80 });
    expect((await generateSampleImage(input)).equals(image)).toBe(true);
  });

  it("makes a blur placeholder that the media table accepts", async () => {
    const image = await generateSampleImage({ id: id(11), alt: {}, width: 96, height: 64 });
    const url = await blurDataUrl(image);
    expect(url).toMatch(BLUR_CHECK);
    const blur = await sharp(Buffer.from(url.split(",")[1], "base64")).metadata();
    expect(blur.format).toBe("webp");
    expect(Math.max(blur.width ?? 0, blur.height ?? 0)).toBe(16);
  });
});

function row(n: number, extra: Partial<SampleRow> = {}): SampleRow {
  return {
    id: id(n),
    bucket: "media",
    path: `2026/01/${id(n)}.jpg`,
    mime_type: "image/jpeg",
    width: 48,
    height: 32,
    credit: SAMPLE_CREDIT,
    alt: { en: "Sample" },
    ...extra,
  };
}

function fakeStore(rows: SampleRow[], existing: string[] = []) {
  const store = {
    listSampleRows: vi.fn(async () => rows),
    listExistingPaths: vi.fn(async () => new Set(existing)),
    upload: vi.fn(async () => "created" as const),
    updateRow: vi.fn(async () => true),
    remove: vi.fn(async () => undefined),
  } satisfies SeedStore;
  return store;
}

describe("seedSampleMedia", () => {
  it("uploads missing files, skips existing ones and updates only uploaded rows", async () => {
    const store = fakeStore([row(1), row(2)], [`2026/01/${id(2)}.jpg`]);
    const counts = await seedSampleMedia(store);

    expect(counts).toEqual({ created: 1, skipped: 1, failed: 0 });
    expect(store.listExistingPaths).toHaveBeenCalledWith(["2026/01"]);
    expect(store.upload).toHaveBeenCalledTimes(1);
    const [path, body, contentType] = store.upload.mock.calls[0] as unknown as [string, Buffer, string];
    expect(path).toBe(`2026/01/${id(1)}.jpg`);
    expect(contentType).toBe("image/jpeg");
    expect(await sharp(body).metadata()).toMatchObject({ format: "jpeg", width: 48, height: 32 });

    expect(store.updateRow).toHaveBeenCalledTimes(1);
    const [rowId, values] = store.updateRow.mock.calls[0] as unknown as [
      string,
      { size_bytes: number; blur_data_url: string },
    ];
    expect(rowId).toBe(id(1));
    expect(values.size_bytes).toBe(body.length);
    expect(values.blur_data_url).toMatch(BLUR_CHECK);
  });

  it("never touches rows with another credit or bucket", async () => {
    const store = fakeStore([row(3, { credit: "Owner photo" }), row(4, { bucket: "private" })]);
    expect(await seedSampleMedia(store)).toEqual({ created: 0, skipped: 0, failed: 0 });
    expect(store.upload).not.toHaveBeenCalled();
    expect(store.updateRow).not.toHaveBeenCalled();
  });

  it("counts an object created meanwhile as skipped and a refused upload as failed", async () => {
    const store = fakeStore([row(5), row(6)]);
    store.upload.mockResolvedValueOnce("exists" as never).mockResolvedValueOnce("failed" as never);
    expect(await seedSampleMedia(store)).toEqual({ created: 0, skipped: 1, failed: 1 });
    expect(store.updateRow).not.toHaveBeenCalled();
  });

  it("removes the uploaded file again when the row cannot be updated", async () => {
    const store = fakeStore([row(7)]);
    store.updateRow.mockResolvedValueOnce(false);
    expect(await seedSampleMedia(store)).toEqual({ created: 0, skipped: 0, failed: 1 });
    expect(store.remove).toHaveBeenCalledWith(`2026/01/${id(7)}.jpg`);
  });

  it("refuses rows that do not match the media checks", async () => {
    const store = fakeStore([
      row(8, { path: "elsewhere/x.jpg" }),
      row(9, { mime_type: "image/svg+xml" }),
      row(10, { path: `2026/01/${id(10)}.png` }),
      row(11, { width: 99999 }),
    ]);
    expect(await seedSampleMedia(store)).toEqual({ created: 0, skipped: 0, failed: 4 });
    expect(store.upload).not.toHaveBeenCalled();
  });
});

describe("createSupabaseStore", () => {
  function fakeClient(
    options: { uploadError?: { message: string; statusCode?: string }; updatedRows?: unknown[] | null } = {},
  ) {
    const filters: Array<[string, unknown]> = [];
    const query = {
      select: vi.fn(() => query),
      update: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      order: vi.fn(() => query),
      range: vi.fn(async () => ({ data: [row(1)], error: null })),
      then: (resolve: (value: { data: unknown[] | null; error: null }) => void) =>
        resolve({ data: options.updatedRows === undefined ? [{ id: id(1) }] : options.updatedRows, error: null }),
    };
    const bucket = {
      list: vi.fn(async () => ({ data: [{ name: `${id(1)}.jpg` }], error: null })),
      upload: vi.fn(async () => ({ data: null, error: options.uploadError ?? null })),
      remove: vi.fn(async () => ({ data: [], error: null })),
    };
    const client = { from: vi.fn(() => query), storage: { from: vi.fn(() => bucket) } };
    return { client, query, bucket, filters };
  }

  it("reads only sample rows of the media bucket", async () => {
    const { client, filters } = fakeClient();
    const store = createSupabaseStore(client as never);
    expect(await store.listSampleRows()).toEqual([row(1)]);
    expect(client.from).toHaveBeenCalledWith("media");
    expect(client.storage.from).toHaveBeenCalledWith("media");
    expect(filters).toEqual([
      ["bucket", "media"],
      ["credit", SAMPLE_CREDIT],
    ]);
  });

  it("lists existing objects per folder", async () => {
    const { client, bucket } = fakeClient();
    const paths = await createSupabaseStore(client as never).listExistingPaths(["2026/01"]);
    expect(bucket.list).toHaveBeenCalledWith("2026/01", expect.objectContaining({ limit: 1000, offset: 0 }));
    expect([...paths]).toEqual([`2026/01/${id(1)}.jpg`]);
  });

  it("uploads with the row's content type and never overwrites", async () => {
    const { client, bucket } = fakeClient();
    const body = Buffer.from("x");
    expect(await createSupabaseStore(client as never).upload("2026/01/a.jpg", body, "image/jpeg")).toBe("created");
    expect(bucket.upload).toHaveBeenCalledWith("2026/01/a.jpg", body, { contentType: "image/jpeg", upsert: false });
  });

  it("maps a duplicate upload to exists and other errors to failed", async () => {
    const duplicate = fakeClient({ uploadError: { message: "The resource already exists", statusCode: "409" } });
    expect(await createSupabaseStore(duplicate.client as never).upload("p", Buffer.from("x"), "image/jpeg")).toBe(
      "exists",
    );
    const denied = fakeClient({ uploadError: { message: "new row violates row-level security", statusCode: "403" } });
    expect(await createSupabaseStore(denied.client as never).upload("p", Buffer.from("x"), "image/jpeg")).toBe(
      "failed",
    );
  });

  it("updates the row by id and sample credit only", async () => {
    const { client, query, filters } = fakeClient();
    const values = { size_bytes: 10, blur_data_url: "data:image/webp;base64,AA==" };
    expect(await createSupabaseStore(client as never).updateRow(id(1), values)).toBe(true);
    expect(query.update).toHaveBeenCalledWith(values);
    expect(query.select).toHaveBeenCalledWith("id");
    expect(filters).toEqual([
      ["id", id(1)],
      ["bucket", "media"],
      ["credit", SAMPLE_CREDIT],
    ]);
  });

  it("counts an update as done only when exactly one row came back", async () => {
    const values = { size_bytes: 10, blur_data_url: "data:image/webp;base64,AA==" };
    for (const updatedRows of [[], [{ id: id(1) }, { id: id(2) }], null]) {
      const { client } = fakeClient({ updatedRows });
      expect(await createSupabaseStore(client as never).updateRow(id(1), values)).toBe(false);
    }
  });
});
