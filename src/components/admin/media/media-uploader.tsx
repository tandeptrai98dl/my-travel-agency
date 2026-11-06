"use client";

import { CheckCircle2, ImageUp, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { publicEnv } from "@/lib/env/public";
import { fill } from "@/lib/fill";
import { cn } from "@/lib/utils";
import { completeMediaUpload, startMediaUpload } from "@/modules/media/media.actions";
import type { MediaItem } from "@/modules/media/media.schemas";

/** Plain strings (they cross the server/client boundary); templates use `{name}`/`{reason}`. */
export type UploaderLabels = {
  chooseFiles: string;
  dropHint: string;
  uploadsTitle: string;
  uploading: string;
  uploaded: string;
  failed: string;
  reasons: Record<string, string>;
  loading: string;
};

type Status = { id: string; name: string; state: "uploading" | "done" | "error"; message: string };

type Props = {
  labels: UploaderLabels;
  /** Called for every image that passed the server checks. */
  onUploaded?: (item: MediaItem) => void;
  /** Refresh the server-rendered list after uploads (media library page). */
  refreshOnDone?: boolean;
  className?: string;
};

/**
 * Two-step upload (docs/specs/phase-2 decision 6): the server hands out a signed URL, the file
 * goes straight to Storage, then the server checks the real type, size and dimensions and records
 * it. One file at a time, with a live status per file.
 */
export function MediaUploader({ labels, onUploaded, refreshOnDone, className }: Props) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = statuses.some((status) => status.state === "uploading");

  const update = (id: string, patch: Partial<Status>) =>
    setStatuses((current) => current.map((status) => (status.id === id ? { ...status, ...patch } : status)));

  async function uploadOne(file: File, id: string): Promise<boolean> {
    const fail = (code: string) => {
      const reason = labels.reasons[code] ?? labels.reasons.failed;
      update(id, { state: "error", message: fill(labels.failed, { name: file.name, reason }) });
      return false;
    };
    const start = await startMediaUpload({ fileName: file.name, size: file.size, contentType: file.type });
    if (!start.ok) return fail(start.error);
    const put = await fetch(start.value.signedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "content-type": file.type,
        "x-upsert": "false",
        apikey: publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      },
    }).catch(() => null);
    if (!put?.ok) return fail(put?.status === 413 ? "too_large" : "failed");
    const done = await completeMediaUpload({ path: start.value.path });
    if (!done.ok) return fail(done.error);
    update(id, { state: "done", message: fill(labels.uploaded, { name: file.name }) });
    onUploaded?.(done.value);
    return true;
  }

  async function uploadAll(files: File[]) {
    if (files.length === 0) return;
    const batch = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      state: "uploading" as const,
      message: fill(labels.uploading, { name: file.name }),
    }));
    setStatuses((current) => [...batch, ...current].slice(0, 20));
    let succeeded = 0;
    for (const [index, file] of files.entries()) {
      if (await uploadOne(file, batch[index].id)) succeeded += 1;
    }
    if (succeeded > 0 && refreshOnDone) router.refresh();
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void uploadAll(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-lg border border-dashed border-input px-6 py-8 text-center transition-colors",
          dragging && "border-ring bg-secondary",
        )}
      >
        <ImageUp className="h-8 w-8 text-gold" strokeWidth={1.5} aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(event) => void uploadAll(Array.from(event.target.files ?? []))}
        />
        <Button asChild variant="outline" aria-disabled={busy}>
          <label htmlFor={inputId} className={cn("cursor-pointer", busy && "pointer-events-none opacity-50")}>
            {labels.chooseFiles}
          </label>
        </Button>
        <p className="text-small text-muted-foreground">{labels.dropHint}</p>
      </div>
      {statuses.length > 0 && (
        <section aria-label={labels.uploadsTitle}>
          <ul className="flex flex-col gap-2" aria-live="polite">
            {statuses.map((status) => (
              <li key={status.id} className="flex items-center gap-2 text-small" data-state={status.state}>
                {status.state === "uploading" && <Spinner label={labels.loading} className="[&_svg]:h-4 [&_svg]:w-4" />}
                {status.state === "done" && (
                  <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.5} aria-hidden="true" />
                )}
                {status.state === "error" && (
                  <XCircle className="h-4 w-4 text-destructive" strokeWidth={1.5} aria-hidden="true" />
                )}
                <span className={cn(status.state === "error" && "text-destructive")}>{status.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
