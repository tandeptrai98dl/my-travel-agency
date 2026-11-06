"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { deleteRedirectAction, resyncRedirectsAction } from "@/modules/content/redirects.actions";

import { useContentErrorText } from "./use-content-error-text";

/** Delete one redirect, with confirmation. */
export function DeleteRedirectButton({ id, fromPath }: { id: string; fromPath: string }) {
  const t = useTranslations("Admin.Content.redirects");
  const tf = useTranslations("Admin.Form");
  const ts = useTranslations("Admin.Shell");
  const errorText = useContentErrorText();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm" className="text-destructive" aria-label={t("deleteLabel", { path: fromPath })}>
          <Trash2 strokeWidth={1.5} aria-hidden="true" />
          {t("delete")}
        </Button>
      }
      title={t("deleteTitle")}
      description={t("deleteBody", { path: fromPath })}
      confirmLabel={t("delete")}
      cancelLabel={tf("cancel")}
      closeLabel={ts("close")}
      errorLabel={tf("actionFailed")}
      destructive
      onConfirm={async () => {
        const result = await deleteRedirectAction({ id });
        if (!result.ok) {
          toast({ title: errorText(result.error), variant: "destructive" });
          return;
        }
        toast({ title: t("deleted"), variant: "success" });
        router.refresh();
      }}
    />
  );
}

/** Rebuild the Redis copy from the table (decision 5). */
export function ResyncRedirectsButton({ redisConfigured }: { redisConfigured: boolean }) {
  const t = useTranslations("Admin.Content.redirects");
  const errorText = useContentErrorText();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const result = await resyncRedirectsAction();
          if (!result.ok) {
            toast({ title: errorText(result.error), variant: "destructive" });
            return;
          }
          toast({
            title: result.synced ? t("resynced", { count: result.count }) : t("resyncSkipped", { count: result.count }),
            variant: result.synced ? "success" : "default",
          });
        })
      }
    >
      <RefreshCw strokeWidth={1.5} aria-hidden="true" className={pending ? "animate-spin motion-reduce:animate-none" : undefined} />
      {redisConfigured ? t("resync") : t("resyncCheck")}
    </Button>
  );
}
