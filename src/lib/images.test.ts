import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/public", () => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co/",
    NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS: true,
  },
}));

import { publicEnv } from "@/lib/env/public";

import { fillImageAttributes, mediaUrl, openGraphImageUrl, supabaseImageLoader } from "./images";

describe("mediaUrl", () => {
  it("builds the public object URL with encoded segments", () => {
    expect(mediaUrl("2026/01/a b.jpg")).toBe(
      "https://proj.supabase.co/storage/v1/object/public/media/2026/01/a%20b.jpg",
    );
  });
});

describe("supabaseImageLoader", () => {
  it("rewrites this project's public objects to the render endpoint", () => {
    expect(supabaseImageLoader({ src: mediaUrl("2026/01/x.jpg"), width: 640 })).toBe(
      "https://proj.supabase.co/storage/v1/render/image/public/media/2026/01/x.jpg?width=640&quality=75&resize=contain",
    );
    expect(supabaseImageLoader({ src: mediaUrl("x.jpg"), width: 320, quality: 60 })).toContain("quality=60");
  });

  it("leaves other hosts and data URLs alone", () => {
    expect(supabaseImageLoader({ src: "https://elsewhere.example/x.jpg", width: 640 })).toBe(
      "https://elsewhere.example/x.jpg?w=640",
    );
    expect(supabaseImageLoader({ src: "https://elsewhere.example/x.jpg?v=1", width: 640 })).toBe(
      "https://elsewhere.example/x.jpg?v=1&w=640",
    );
    expect(supabaseImageLoader({ src: "data:image/webp;base64,AAAA", width: 64 })).toBe("data:image/webp;base64,AAAA");
  });
});

describe("openGraphImageUrl", () => {
  const flags = publicEnv as { NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS: boolean };
  afterEach(() => {
    flags.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS = true;
  });

  it("asks for a 1200×630 cover crop when transforms are on", () => {
    expect(openGraphImageUrl(mediaUrl("x.jpg"))).toEqual({
      url: "https://proj.supabase.co/storage/v1/render/image/public/media/x.jpg?width=1200&height=630&resize=cover&quality=80",
      width: 1200,
      height: 630,
    });
  });

  it("uses the original without transforms", () => {
    flags.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS = false;
    expect(openGraphImageUrl(mediaUrl("x.jpg"))).toEqual({ url: mediaUrl("x.jpg") });
  });
});

describe("fillImageAttributes", () => {
  afterEach(() => {
    vi.mocked(publicEnv).NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS = true;
  });
  const image = { src: "https://proj.supabase.co/storage/v1/object/public/media/a.jpg", blurDataUrl: "data:image/webp;base64,AAA" };

  it("offers a srcset through the render endpoint and fills the parent", () => {
    const attributes = fillImageAttributes(image, "100vw", false);
    expect(attributes.srcSet?.split(", ")).toHaveLength(8);
    expect(attributes.srcSet).toContain("/render/image/public/media/a.jpg?width=640&quality=75&resize=contain 640w");
    expect(attributes.sizes).toBe("100vw");
    expect(attributes.loading).toBe("lazy");
    expect(attributes.fetchPriority).toBeUndefined();
    expect(attributes.style).toMatchObject({ position: "absolute", width: "100%", height: "100%" });
    expect(attributes.style.backgroundImage).toBe('url("data:image/webp;base64,AAA")');
  });

  it("loads a priority image eagerly with high priority", () => {
    const attributes = fillImageAttributes({ ...image, blurDataUrl: null }, "100vw", true);
    expect(attributes.loading).toBe("eager");
    expect(attributes.fetchPriority).toBe("high");
    expect(attributes.style).not.toHaveProperty("backgroundImage");
  });

  it("uses the original without transforms", () => {
    vi.mocked(publicEnv).NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS = false;
    const attributes = fillImageAttributes(image, "100vw", false);
    expect(attributes.src).toBe(image.src);
    expect(attributes.srcSet).toBeUndefined();
    expect(attributes.sizes).toBeUndefined();
  });
});
