"use client";

import { type ComponentProps, useEffect, useRef, useState } from "react";

import { ImageFrame } from "./image-frame";

type Props = ComponentProps<"img"> & { alt: string; /** Render nothing instead of the frame. */ hideOnError?: boolean };

/**
 * An `<img>` that becomes an `ImageFrame` when its file fails to load (Phase 3 spec decision 1), and
 * drops the blur placeholder background once the photo has loaded (as `next/image` does).
 */
export function FallbackImage({ alt, style, hideOnError = false, ...props }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // An image that failed before hydration never fires onError: check once after mounting.
  useEffect(() => {
    const element = ref.current;
    if (element?.complete) {
      if (element.naturalWidth === 0) setFailed(true);
      else setLoaded(true);
    }
  }, []);
  if (failed) return hideOnError ? null : <ImageFrame label={alt} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- attributes from fillImageAttributes() (next/image's output).
    <img
      ref={ref}
      alt={alt}
      {...props}
      style={loaded ? { ...style, backgroundImage: undefined } : style}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}
