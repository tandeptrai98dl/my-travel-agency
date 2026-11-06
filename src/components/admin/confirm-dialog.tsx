"use client";

import { useState } from "react";

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

type Props = {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  /** Shown in the dialog when the action throws. */
  errorLabel: string;
  destructive?: boolean;
  /** Runs the action; the dialog stays open (button busy) until it settles. */
  onConfirm: () => Promise<void> | void;
};

/** Asks before a destructive or irreversible action (delete, publish, deactivate). */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  errorLabel,
  destructive,
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        setFailed(false);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={closeLabel} role="alertdialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {failed && (
          <p role="alert" className="text-small font-medium text-destructive">
            {errorLabel}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            aria-busy={busy}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setFailed(false);
              try {
                await onConfirm();
                setOpen(false);
              } catch {
                setFailed(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
