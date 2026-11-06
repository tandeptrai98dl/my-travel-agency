"use client";

import { ImagePlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { fill } from "@/lib/fill";
import type { MediaItem } from "@/modules/media/media.schemas";

import { MediaPicker, type MediaPickerLabels } from "./media-picker";

/** Design system demo: opens the picker and shows what was chosen. */
export function MediaPickerDemo({ labels, openLabel, chosenLabel }: { labels: MediaPickerLabels; openLabel: string; chosenLabel: string }) {
  const [chosen, setChosen] = useState<MediaItem[]>([]);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <MediaPicker
        multiple
        labels={labels}
        onSelect={setChosen}
        trigger={
          <Button variant="outline">
            <ImagePlus strokeWidth={1.5} aria-hidden="true" />
            {openLabel}
          </Button>
        }
      />
      <p className="text-small text-muted-foreground" aria-live="polite" data-testid="picker-result">
        {fill(chosenLabel, { count: chosen.length })}
      </p>
    </div>
  );
}
