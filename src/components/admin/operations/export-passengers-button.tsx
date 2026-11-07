"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { exportPassengersAction } from "@/modules/operations/passengers.actions";

import { downloadCsv } from "./download-file";

/**
 * Downloads the departure's passenger list as CSV (operators and admins). The database writes
 * the export to the audit log before it returns any row.
 */
export function ExportPassengersButton({ departureId }: { departureId: string }) {
  const t = useTranslations("Admin.Operations.Passengers");
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const result = await exportPassengersAction({ departureId });
          if (!result.ok) {
            toast({ title: t(`errors.${result.error}`), variant: "destructive" });
            return;
          }
          downloadCsv(result.csv, result.filename);
          toast({ title: t("exported", { count: result.count }), variant: "success" });
        })
      }
    >
      <Download strokeWidth={1.5} aria-hidden="true" />
      {t("export")}
    </Button>
  );
}
