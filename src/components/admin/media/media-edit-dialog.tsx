"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { fill } from "@/lib/fill";
import { removeMedia, saveMediaDetails } from "@/modules/media/media.actions";
import type { MediaItem } from "@/modules/media/media.schemas";

export type MediaEditLabels = {
  edit: string;
  editTitle: string;
  altVi: string;
  altEn: string;
  altHint: string;
  credit: string;
  save: string;
  saved: string;
  delete: string;
  deleteTitle: string;
  deleteBody: string;
  deleted: string;
  /** Template with `{reason}`. */
  deleteFailed: string;
  reasons: Record<string, string>;
  cancel: string;
  close: string;
  actionFailed: string;
  small: string;
  smallHint: string;
  dimensions: string;
  fileSize: string;
};

/** Edit alt text and credit, or delete an unused image. */
export function MediaEditDialog({ item, labels, trigger }: { item: MediaItem; labels: MediaEditLabels; trigger: React.ReactNode }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [altVi, setAltVi] = useState(item.alt.vi);
  const [altEn, setAltEn] = useState(item.alt.en);
  const [credit, setCredit] = useState(item.credit ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** After a delete the trigger disappears with the card, so focus goes to the page instead. */
  const deletedRef = useRef(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveMediaDetails({ id: item.id, alt: { vi: altVi, en: altEn }, credit: credit.trim() || null });
    setSaving(false);
    if (!result.ok) {
      setError(labels.reasons[result.error] ?? labels.reasons.failed);
      return;
    }
    toast({ title: labels.saved, variant: "success" });
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        closeLabel={labels.close}
        className="max-w-2xl"
        onCloseAutoFocus={(event) => {
          if (!deletedRef.current) return;
          event.preventDefault();
          document.getElementById("admin-main")?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{labels.editTitle}</DialogTitle>
          <DialogDescription>
            <span className="break-all">{item.originalName ?? item.path}</span> · {labels.dimensions} · {labels.fileSize}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[minmax(0,14rem)_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary upload */}
          <img
            src={item.url}
            alt={item.alt.vi || item.alt.en || ""}
            width={item.width ?? undefined}
            height={item.height ?? undefined}
            className="h-auto w-full bg-secondary object-contain"
            style={item.blurDataUrl ? { backgroundImage: `url(${item.blurDataUrl})`, backgroundSize: "cover" } : undefined}
          />
          <form id={`${id}-form`} onSubmit={save} className="flex flex-col gap-4">
            {item.small && (
              <p className="flex items-start gap-2 text-small text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span>
                  {labels.small}. {labels.smallHint}
                </span>
              </p>
            )}
            <p id={`${id}-alt-hint`} className="text-small text-muted-foreground">
              {labels.altHint}
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-vi`}>{labels.altVi}</Label>
              <Textarea id={`${id}-vi`} lang="vi" rows={2} maxLength={300} value={altVi} onChange={(e) => setAltVi(e.target.value)} aria-describedby={`${id}-alt-hint`} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-en`}>{labels.altEn}</Label>
              <Textarea id={`${id}-en`} lang="en" rows={2} maxLength={300} value={altEn} onChange={(e) => setAltEn(e.target.value)} aria-describedby={`${id}-alt-hint`} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-credit`}>{labels.credit}</Label>
              <Input id={`${id}-credit`} maxLength={200} value={credit} onChange={(e) => setCredit(e.target.value)} />
            </div>
            {error && (
              <p role="alert" className="text-small font-medium text-destructive">
                {error}
              </p>
            )}
          </form>
        </div>
        <DialogFooter className="sm:justify-between">
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" className="text-destructive">
                <Trash2 strokeWidth={1.5} aria-hidden="true" />
                {labels.delete}
              </Button>
            }
            title={labels.deleteTitle}
            description={labels.deleteBody}
            confirmLabel={labels.delete}
            cancelLabel={labels.cancel}
            closeLabel={labels.close}
            errorLabel={labels.actionFailed}
            destructive
            onConfirm={async () => {
              const result = await removeMedia({ id: item.id });
              if (!result.ok) {
                const reason = labels.reasons[result.error] ?? labels.reasons.failed;
                toast({ title: fill(labels.deleteFailed, { reason }), variant: "destructive" });
                return;
              }
              toast({ title: labels.deleted, variant: "success" });
              deletedRef.current = true;
              setOpen(false);
              router.refresh();
            }}
          />
          <Button type="submit" form={`${id}-form`} disabled={saving} aria-busy={saving}>
            {labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
