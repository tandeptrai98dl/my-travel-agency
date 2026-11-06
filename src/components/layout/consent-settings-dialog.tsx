"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { type ConsentChoice, ESSENTIAL_ONLY } from "@/lib/consent";
import { useLabels } from "./labels";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ConsentChoice;
  onDraftChange: (update: (draft: ConsentChoice) => ConsentChoice) => void;
  onSave: (choice: ConsentChoice) => void;
  /** Where focus goes when the dialog closes (it has no Radix trigger). */
  onCloseAutoFocus: () => void;
};

/** Per-category cookie settings. Loaded on first open by the consent banner. */
export default function ConsentSettingsDialog({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  onSave,
  onCloseAutoFocus,
}: Props) {
  const id = useId();
  const t = useLabels("Consent");
  const tNav = useLabels("Navigation");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={tNav("close")}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onCloseAutoFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("settingsTitle")}</DialogTitle>
          <DialogDescription>{t("settingsBody")}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y divide-border">
          <ConsentRow id={`${id}-essential`} title={t("essential")} description={t("essentialDesc")}>
            <span className="text-small text-muted-foreground">{t("alwaysOn")}</span>
          </ConsentRow>
          <ConsentRow id={`${id}-analytics`} title={t("analytics")} description={t("analyticsDesc")}>
            <Switch
              aria-describedby={`${id}-analytics`}
              checked={draft.analytics}
              onCheckedChange={(analytics) => onDraftChange((d) => ({ ...d, analytics }))}
              aria-label={t("analytics")}
            />
          </ConsentRow>
          <ConsentRow id={`${id}-marketing`} title={t("marketing")} description={t("marketingDesc")}>
            <Switch
              aria-describedby={`${id}-marketing`}
              checked={draft.marketing}
              onCheckedChange={(marketing) => onDraftChange((d) => ({ ...d, marketing }))}
              aria-label={t("marketing")}
            />
          </ConsentRow>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onSave(ESSENTIAL_ONLY)}>
            {t("rejectAll")}
          </Button>
          <Button onClick={() => onSave(draft)}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsentRow({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-6 py-4">
      <div className="flex flex-col gap-1">
        <span className="font-medium">{title}</span>
        <span id={id} className="text-small text-muted-foreground">
          {description}
        </span>
      </div>
      <div className="flex min-h-6 items-center">{children}</div>
    </li>
  );
}
