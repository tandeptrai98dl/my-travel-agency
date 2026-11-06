"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { imageTransformsEnabled, supabaseImageLoader, type ImageData } from "@/lib/images";
import { cn } from "@/lib/utils";

import { ImageFrame } from "./image-frame";

type Props = {
  image: ImageData | null;
  /** The `sizes` attribute for this placement, e.g. "(min-width: 1024px) 33vw, 100vw". */
  sizes: string;
  /** Only for the largest image above the fold (LCP). */
  priority?: boolean;
  className?: string;
  /** Zooms the image 1.03 on hover of the nearest `.group` (DESIGN_SYSTEM.md "Motion"). */
  zoomOnHover?: boolean;
};

/**
 * A public photo that fills its positioned parent (the parent sets the aspect ratio), with the
 * Supabase image loader, a blur placeholder and alt text in the current language. A missing image
 * or a file that fails to load becomes an `ImageFrame` (Phase 3 spec decision 1).
 */
export function ResponsiveImage({ image, sizes, priority = false, className, zoomOnHover = false }: Props) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // An image that failed before hydration never fires onError: check once after mounting.
  useEffect(() => {
    const element = ref.current;
    if (element && element.complete && element.naturalWidth === 0) setFailed(true);
  }, []);
  if (!image || failed) return <ImageFrame label={image?.alt} />;

  const transforms = imageTransformsEnabled();
  return (
    <Image
      ref={ref}
      src={image.src}
      alt={image.alt}
      fill
      sizes={sizes}
      priority={priority}
      loader={transforms ? supabaseImageLoader : undefined}
      unoptimized={!transforms}
      placeholder={image.blurDataUrl ? "blur" : "empty"}
      blurDataURL={image.blurDataUrl ?? undefined}
      onError={() => setFailed(true)}
      className={cn(
        "object-cover",
        zoomOnHover &&
          "transition-transform duration-400 ease-luxe group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
        className,
      )}
    />
  );
}
