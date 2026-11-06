
import { cx } from "@/lib/cx";
import { fillImageAttributes, type ImageData } from "@/lib/images";

import { FallbackImage } from "./fallback-image";
import { ImageFrame } from "./image-frame";

type Props = {
  image: ImageData | null;
  /** The `sizes` attribute for this placement, e.g. "(min-width: 1024px) 33vw, 100vw". */
  sizes: string;
  /** Only for the largest image above the fold (LCP): loaded eagerly with high priority. */
  priority?: boolean;
  /** `contain` shows the whole photo (lightbox); `cover` (default) fills and crops. */
  fit?: "cover" | "contain";
  /** Extra classes; they must not conflict with the image's own (no merging, see `cx`). */
  className?: string;
  /** What stands in for a missing or broken image: a neutral frame (default) or nothing (heroes). */
  fallback?: "frame" | "none";
  /** Zooms the image 1.03 on hover of the nearest `.group` (DESIGN_SYSTEM.md "Motion"). */
  zoomOnHover?: boolean;
};

/**
 * A public photo that fills its positioned parent (the parent sets the aspect ratio), with the
 * Supabase image loader, a blur placeholder and alt text in the current language. A missing image
 * or a file that fails to load becomes an `ImageFrame` (Phase 3 spec decision 1).
 *
 * The `<img>` attributes are built by `fillImageAttributes()` (what `next/image` with `fill`
 * renders), so public pages ship no `next/image` client code (about 6 KB gzip; spec decision 16);
 * only the small `FallbackImage` hydrates, to swap in the frame when the file fails to load.
 */
export function ResponsiveImage({
  image,
  sizes,
  priority = false,
  fit = "cover",
  fallback = "frame",
  className,
  zoomOnHover = false,
}: Props) {
  if (!image) return fallback === "frame" ? <ImageFrame /> : null;

  const attributes = fillImageAttributes(image, sizes, priority);
  // No preload() for priority images: from a server component it becomes a hint in the RSC
  // payload, so prefetching a link would download that page's hero. The <img> is in the HTML with
  // fetchpriority="high" and loading="eager" instead.
  return (
    <FallbackImage
      {...attributes}
      alt={image.alt}
      hideOnError={fallback === "none"}
      className={cx(
        fit === "contain" ? "object-contain" : "object-cover",
        zoomOnHover &&
          "transition-transform duration-400 ease-luxe group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
        className,
      )}
    />
  );
}
