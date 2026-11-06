"use client";

import { lazy, Suspense, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import type { ImageData } from "@/lib/images";

export type GalleryLabels = { viewAll: string; dialogTitle: string; close: string; previous: string; next: string; counter: string };

// The lightbox code loads on first open only (Phase 3 spec decision 16).
const GalleryLightbox = lazy(() => import("./gallery-lightbox"));

/** "View N photos": opens every photo of the tour in a lightbox. */
export function GalleryButton({ images, title, labels }: { images: ImageData[]; title: string; labels: GalleryLabels }) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={buttonVariants({ variant: "secondary", size: "sm" })}
        onClick={() => {
          setRequested(true);
          setOpen(true);
        }}
      >
        {labels.viewAll.replace("{count}", String(images.length))}
      </button>
      {requested && (
        <Suspense fallback={null}>
          <GalleryLightbox
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) trigger.current?.focus();
            }}
            images={images}
            title={title}
            labels={labels}
          />
        </Suspense>
      )}
    </>
  );
}
