"use client";

import { Check, Search } from "lucide-react";
import { useCallback, useEffect, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { fill } from "@/lib/fill";
import { cn } from "@/lib/utils";
import { browseMedia } from "@/modules/media/media.actions";
import type { MediaItem } from "@/modules/media/media.schemas";

import { MediaUploader, type UploaderLabels } from "./media-uploader";

export type MediaPickerLabels = {
  title: string;
  description: string;
  search: string;
  empty: string;
  loading: string;
  loadMore: string;
  /** Template with `{count}`. */
  selectCount: string;
  select: string;
  cancel: string;
  close: string;
  altMissing: string;
  forbidden: string;
  uploader: UploaderLabels;
};

type Props = {
  trigger: React.ReactNode;
  labels: MediaPickerLabels;
  multiple?: boolean;
  onSelect: (items: MediaItem[]) => void;
};

/**
 * Pick images from the library (or upload new ones) for tours, destinations and articles. Images
 * without both alt texts can be picked but are flagged; publishing checks them (decision 6).
 */
export function MediaPicker({ trigger, labels, multiple = false, onSelect }: Props) {
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [selected, setSelected] = useState<Map<string, MediaItem>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(
    (query: string, nextPage: number) =>
      startTransition(async () => {
        const result = await browseMedia({ q: query, page: nextPage });
        if (!result.ok) {
          setError(labels.forbidden);
          return;
        }
        setError(null);
        setPageCount(result.value.pageCount);
        setPage(nextPage);
        setItems((current) => (nextPage === 1 ? result.value.items : [...current, ...result.value.items]));
      }),
    [labels.forbidden],
  );

  useEffect(() => {
    if (open) load("", 1);
    else setSelected(new Map());
  }, [open, load]);

  const toggle = (item: MediaItem) =>
    setSelected((current) => {
      const next = new Map(multiple ? current : []);
      if (current.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={labels.close} className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            load(q, 1);
          }}
        >
          <label htmlFor={searchId} className="sr-only">
            {labels.search}
          </label>
          <Input id={searchId} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} />
          <Button type="submit" variant="outline" size="icon" aria-label={labels.search}>
            <Search strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </form>
        <MediaUploader
          labels={labels.uploader}
          className="[&>div:first-child]:py-4"
          onUploaded={(item) => {
            setItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)]);
            toggle(item);
          }}
        />
        {error && (
          <p role="alert" className="text-small font-medium text-destructive">
            {error}
          </p>
        )}
        <div aria-busy={pending} className="min-h-24">
          {items.length === 0 && !pending ? (
            <p className="py-8 text-center text-small text-muted-foreground">{labels.empty}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {items.map((item) => {
                const isSelected = selected.has(item.id);
                const name = item.alt.vi || item.alt.en || item.path;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={name}
                      onClick={() => toggle(item)}
                      className={cn(
                        "relative block aspect-square w-full overflow-hidden bg-secondary bg-cover outline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isSelected && "ring-2 ring-primary ring-offset-2",
                      )}
                      style={item.blurDataUrl ? { backgroundImage: `url(${item.blurDataUrl})` } : undefined}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                      <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {isSelected && (
                        <span className="absolute right-1 top-1 rounded-sm bg-primary p-1 text-primary-foreground">
                          <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        </span>
                      )}
                      {!item.altComplete && (
                        <span className="absolute inset-x-0 bottom-0 bg-warning px-1 text-[0.6875rem] font-semibold text-warning-foreground">
                          {labels.altMissing}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {pending && <Spinner label={labels.loading} className="mt-4" />}
          {page < pageCount && !pending && (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="ghost" onClick={() => load(q, page + 1)}>
                {labels.loadMore}
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {labels.cancel}
          </Button>
          <Button
            type="button"
            disabled={selected.size === 0}
            onClick={() => {
              onSelect([...selected.values()]);
              setOpen(false);
            }}
          >
            {multiple ? fill(labels.selectCount, { count: selected.size }) : labels.select}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
