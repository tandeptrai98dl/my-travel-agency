"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { ResponsiveImage } from "@/components/media/responsive-image";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import type { ImageData } from "@/lib/images";

import type { GalleryLabels } from "./gallery-button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: ImageData[];
  title: string;
  labels: GalleryLabels;
};

/** Full-size photos with previous/next buttons and arrow keys while the dialog has focus. */
export default function GalleryLightbox({ open, onOpenChange, images, title, labels }: Props) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const go = (step: number) => setIndex((current) => (current + step + count) % count);
  const image = images[index];
  const counter = labels.counter.replace("{index}", String(index + 1)).replace("{count}", String(count));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={labels.close}
        className="max-w-5xl gap-4"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") go(1);
          if (event.key === "ArrowLeft") go(-1);
        }}
      >
        <DialogTitle className="font-serif text-h3 font-semibold">{labels.dialogTitle}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        <div className="relative aspect-[3/2] w-full overflow-hidden bg-muted">
          <ResponsiveImage key={image?.src} image={image ?? null} sizes="(min-width: 1024px) 1024px, 100vw" fit="contain" />
        </div>
        <div className="flex items-center justify-between gap-4">
          <p aria-live="polite" className="text-small text-muted-foreground">
            {counter}
            {image?.alt ? ` · ${image.alt}` : ""}
          </p>
          <div className="flex gap-2">
            <IconButton label={labels.previous} variant="secondary" onClick={() => go(-1)} icon={<ChevronLeft strokeWidth={1.5} />} />
            <IconButton label={labels.next} variant="secondary" onClick={() => go(1)} icon={<ChevronRight strokeWidth={1.5} />} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
