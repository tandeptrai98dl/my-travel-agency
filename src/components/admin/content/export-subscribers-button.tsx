"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { exportSubscribersAction } from "@/modules/content/subscribers.actions";

import { useContentErrorText } from "./use-content-error-text";

/** Downloads the active subscribers as CSV; the export is written to the audit log. */
export function ExportSubscribersButton() {
  const t = useTranslations("Admin.Content.subscribers");
  const errorText = useContentErrorText();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const result = await exportSubscribersAction();
          if (!result.ok) {
            toast({ title: errorText(result.error), variant: "destructive" });
            return;
          }
          // The BOM makes spreadsheet apps read the file as UTF-8 (Vietnamese names).
          const url = URL.createObjectURL(new Blob(["﻿", result.csv], { type: "text/csv;charset=utf-8" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = result.filename;
          link.click();
          URL.revokeObjectURL(url);
          toast({ title: t("exported", { count: result.count }), variant: "success" });
        })
      }
    >
      <Download strokeWidth={1.5} aria-hidden="true" />
      {t("export")}
    </Button>
  );
}
