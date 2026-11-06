"use client";

import { ImagePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { MediaPicker, type MediaPickerLabels } from "@/components/admin/media/media-picker";
import { Button } from "@/components/ui/button";
import type { MediaSummary } from "@/modules/catalog/tours/tours.service";

import { focusAfterMove, focusAfterRemove, RowControls, useAnnouncer } from "./row-controls";

/**
 * Ordered gallery (spec step 13). Reordering uses buttons rather than drag and drop, so it works
 * with a keyboard and a screen reader; moves and removals are announced.
 */
export function GalleryField({
  value,
  onChange,
  initial,
  pickerLabels,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  initial: Record<string, MediaSummary>;
  pickerLabels: MediaPickerLabels;
}) {
  const t = useTranslations("Admin.Tours");
  const [known, setKnown] = useState<Record<string, MediaSummary>>(initial);
  const listRef = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const { announce, region } = useAnnouncer();

  const move = (from: number, to: number) => {
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    announce(t("imageMoved", { from: from + 1, to: to + 1 }));
    focusAfterMove(listRef.current, to);
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-small font-medium">{t("gallery")}</legend>
      {region}
      {value.length === 0 && <p className="text-small text-muted-foreground">{t("noImages")}</p>}
      <ol ref={listRef} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {value.map((id, index) => {
          const item = known[id];
          return (
            <li key={id} data-row className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
              <div className="aspect-[3/2] overflow-hidden bg-secondary">
                {item && (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                  <img src={item.url} alt={item.alt} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-small">
                  {index + 1}
                  {item && !item.altComplete && <span className="text-warning"> · {t("imageAltMissing")}</span>}
                </span>
                <RowControls
                  index={index}
                  count={value.length}
                  labels={{
                    up: t("moveImageUp", { index: index + 1 }),
                    down: t("moveImageDown", { index: index + 1 }),
                    remove: t("removeImage", { index: index + 1 }),
                  }}
                  onMove={move}
                  onRemove={(at) => {
                    onChange(value.filter((_, i) => i !== at));
                    announce(t("imageRemoved", { index: at + 1 }));
                    focusAfterRemove(listRef.current, at, addRef.current);
                  }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <div>
        <MediaPicker
          multiple
          labels={pickerLabels}
          trigger={
            <Button ref={addRef} type="button" variant="outline">
              <ImagePlus strokeWidth={1.5} aria-hidden="true" />
              {t("addImages")}
            </Button>
          }
          onSelect={(items) => {
            setKnown((current) => ({
              ...current,
              ...Object.fromEntries(
                items.map((item) => [
                  item.id,
                  { id: item.id, url: item.url, alt: item.alt.vi || item.alt.en, altComplete: item.altComplete },
                ]),
              ),
            }));
            onChange([...value, ...items.map((item) => item.id).filter((id) => !value.includes(id))].slice(0, 40));
          }}
        />
      </div>
    </fieldset>
  );
}
