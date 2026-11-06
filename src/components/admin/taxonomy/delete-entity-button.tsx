"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
  type ActionResult,
  deleteCancellationPolicyAction,
  deleteDestinationAction,
  deleteTravelStyleAction,
} from "@/modules/catalog/taxonomy/taxonomy.actions";

import { useErrorText } from "./form-parts";

const ACTIONS = {
  destination: deleteDestinationAction,
  travelStyle: deleteTravelStyleAction,
  cancellationPolicy: deleteCancellationPolicyAction,
} satisfies Record<string, (input: unknown) => Promise<ActionResult>>;

/** Delete with confirmation; refused while tours or child destinations still use the item. */
export function DeleteEntityButton({
  kind,
  id,
  listHref,
}: {
  kind: keyof typeof ACTIONS;
  id: string;
  listHref: string;
}) {
  const t = useTranslations("Admin.Taxonomy");
  const tf = useTranslations("Admin.Form");
  const ts = useTranslations("Admin.Shell");
  const errorText = useErrorText();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" className="text-destructive">
          <Trash2 strokeWidth={1.5} aria-hidden="true" />
          {t("delete")}
        </Button>
      }
      title={t("deleteTitle")}
      description={t("deleteBody")}
      confirmLabel={t("delete")}
      cancelLabel={tf("cancel")}
      closeLabel={ts("close")}
      errorLabel={tf("actionFailed")}
      destructive
      onConfirm={async () => {
        const result = await ACTIONS[kind]({ id });
        if (!result.ok) {
          toast({ title: errorText(result.error), variant: "destructive" });
          return;
        }
        toast({ title: t("deleted"), variant: "success" });
        router.push(listHref);
      }}
    />
  );
}
