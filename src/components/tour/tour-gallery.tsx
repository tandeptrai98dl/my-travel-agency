import { ResponsiveImage } from "@/components/media/responsive-image";
import type { ImageData } from "@/lib/images";
import { cn } from "@/lib/utils";

import { GalleryButton, type GalleryLabels } from "./gallery-button";

/**
 * Hero gallery: the lead photo large with up to four beside it from `md`; every photo opens in a
 * lightbox loaded on first use (decision 16). The lead photo is the page's LCP image.
 */
export function TourGallery({ images, title, labels }: { images: ImageData[]; title: string; labels: GalleryLabels }) {
  const [lead, ...rest] = images;
  const side = rest.slice(0, 4);
  const grid = side.length === 4;

  return (
    <div className={cn("relative grid gap-2", grid && "md:h-[34rem] md:grid-cols-4 md:grid-rows-2")}>
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden bg-muted",
          grid ? "md:col-span-2 md:row-span-2 md:aspect-auto" : "md:aspect-[21/9]",
        )}
      >
        <ResponsiveImage
          image={lead ?? null}
          sizes={grid ? "(min-width: 1280px) 640px, (min-width: 768px) 50vw, 100vw" : "(min-width: 1280px) 1280px, 100vw"}
          priority
        />
      </div>
      {grid &&
        side.map((image) => (
          <div key={image.src} className="relative hidden overflow-hidden bg-muted md:block">
            <ResponsiveImage image={image} sizes="(min-width: 1280px) 320px, 25vw" />
          </div>
        ))}
      {images.length > 1 && (
        <div className="absolute bottom-4 right-4">
          <GalleryButton images={images} title={title} labels={labels} />
        </div>
      )}
    </div>
  );
}
