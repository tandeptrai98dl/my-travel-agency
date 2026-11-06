import { publicEnv } from "@/lib/env/public";

/**
 * Public media URLs and the Supabase Storage image-transformation loader (Phase 3 spec
 * decision 1). Safe on the client: only public values are read.
 */

export const MEDIA_BUCKET = "media";

/** An image as public components receive it: `src` is the public object URL. */
export type ImageData = {
  src: string;
  width: number;
  height: number;
  alt: string;
  blurDataUrl: string | null;
};

const OBJECT_PREFIX = "/storage/v1/object/public/";
const RENDER_PREFIX = "/storage/v1/render/image/public/";

function supabaseBase(): string {
  return publicEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
}

/** Public URL of an object in the `media` bucket (each path segment encoded). */
export function mediaUrl(path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${supabaseBase()}${OBJECT_PREFIX}${MEDIA_BUCKET}/${encoded}`;
}

/** Whether images go through Supabase image transformations (Pro plan; off locally). */
export function imageTransformsEnabled(): boolean {
  return publicEnv.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS;
}

/**
 * `next/image` loader: rewrites a public object URL of this project to the render endpoint with
 * the requested width. Anything else (another host, a data: URL) is returned unchanged with a
 * width hint, so the loader never points at a URL it does not understand.
 */
export function supabaseImageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  const base = supabaseBase();
  if (base && src.startsWith(`${base}${OBJECT_PREFIX}`)) {
    const rendered = `${base}${RENDER_PREFIX}${src.slice(base.length + OBJECT_PREFIX.length)}`;
    const query = new URLSearchParams({ width: String(width), quality: String(quality ?? 75), resize: "contain" });
    return `${rendered}?${query}`;
  }
  if (src.startsWith("data:")) return src;
  return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
}

/** A 1200×630 Open Graph rendition of a public image (the original when transforms are off). */
export function openGraphImageUrl(src: string): { url: string; width: number; height: number } | { url: string } {
  const base = supabaseBase();
  if (imageTransformsEnabled() && base && src.startsWith(`${base}${OBJECT_PREFIX}`)) {
    const rendered = `${base}${RENDER_PREFIX}${src.slice(base.length + OBJECT_PREFIX.length)}`;
    return { url: `${rendered}?width=1200&height=630&resize=cover&quality=80`, width: 1200, height: 630 };
  }
  return { url: src };
}
