"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { type ContentActionResult, deleteCategoryAction, deletePostAction } from "@/modules/content/content.actions";

import { useContentErrorText } from "./use-content-error-text";

const ACTIONS = {
  post: deletePostAction,
  category: deleteCategoryAction,
} satisfies Record<string, (input: unknown) => Promise<ContentActionResult>>;

/** Delete with confirmation: an article only when not published, a topic only when unused. */
export function DeleteContentButton({ kind, id, listHref }: { kind: keyof typeof ACTIONS; id: string; listHref: string }) {
  const t = useTranslations("Admin.Content");
  const tf = useTranslations("Admin.Form");
  const ts = useTranslations("Admin.Shell");
  const errorText = useContentErrorText();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" className="text-destructive">
          <Trash2 strokeWidth={1.5} aria-hidden="true" />
          {t("delete")}
        </Button>
      }
      title={t(kind === "post" ? "deletePostTitle" : "deleteCategoryTitle")}
      description={t(kind === "post" ? "deletePostBody" : "deleteCategoryBody")}
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
