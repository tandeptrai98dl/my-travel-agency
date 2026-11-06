"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { removeTourLanguageAction } from "@/modules/catalog/tours/tours.actions";

import { useTourErrorText } from "./use-tour-error-text";

type Props = {
  id: string;
  locale: "vi" | "en";
  languageName: string;
  published: boolean;
  /** Clears the language in the open form, so a later save does not bring it back. */
  onRemoved: () => void;
};

/** Removes one saved language of a tour, after a confirmation (Phase 2 polish). */
export function RemoveLanguageButton({ id, locale, languageName, published, onRemoved }: Props) {
  const t = useTranslations("Admin.Tours");
  const ts = useTranslations("Admin.Shell");
  const errorText = useTourErrorText();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm" className="self-start">
          <Trash2 strokeWidth={1.5} aria-hidden="true" />
          {t("removeLanguage", { language: languageName })}
        </Button>
      }
      title={t("removeLanguageTitle", { language: languageName })}
      description={published ? t("removeLanguagePublished") : t("removeLanguageDraft")}
      confirmLabel={t("removeLanguageConfirm")}
      cancelLabel={t("removeLanguageCancel")}
      closeLabel={ts("close")}
      errorLabel={t("errors.removeFailed")}
      destructive
      onConfirm={async () => {
        const result = await removeTourLanguageAction({ id, locale });
        if (!result.ok) {
          toast({ title: errorText(result.error), variant: "destructive" });
          return;
        }
        onRemoved();
        toast({ title: t("languageRemoved", { language: languageName }), variant: "success" });
        router.refresh();
      }}
    />
  );
}
