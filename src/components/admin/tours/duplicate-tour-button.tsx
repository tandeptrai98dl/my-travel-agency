"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

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
import { toast } from "@/components/ui/toaster";
import { duplicateTourAction } from "@/modules/catalog/tours/tours.actions";

import { useTourErrorText } from "./use-tour-error-text";

/** Copies a tour as a draft under a new code (spec Phase 2 step 12). */
export function DuplicateTourButton({ id, code }: { id: string; code: string }) {
  const t = useTranslations("Admin.Tours");
  const tf = useTranslations("Admin.Form");
  const ts = useTranslations("Admin.Shell");
  const errorText = useTourErrorText();
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [newCode, setNewCode] = useState(`${code}-B`.slice(0, 20));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function duplicate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await duplicateTourAction({ id, code: newCode });
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.fields?.code ?? result.error));
      return;
    }
    toast({ title: t("duplicated"), variant: "success" });
    setOpen(false);
    router.push(`/admin/tours/${result.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Copy strokeWidth={1.5} aria-hidden="true" />
          {t("duplicate")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={ts("close")}>
        <form onSubmit={duplicate} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{t("duplicateTitle")}</DialogTitle>
            <DialogDescription>{t("duplicateBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{t("duplicateCode")}</Label>
            <Input
              id={fieldId}
              value={newCode}
              maxLength={20}
              spellCheck={false}
              onChange={(event) => setNewCode(event.target.value.toUpperCase())}
              aria-invalid={Boolean(error)}
              aria-describedby={`${fieldId}-error`}
            />
            <p id={`${fieldId}-error`} aria-live="polite" className="text-small font-medium text-destructive empty:-mt-2">
              {error}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tf("cancel")}
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {t("duplicate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
