"use client";

import "@/lib/zod-config";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { LocaleTabs } from "@/components/admin/locale-tabs";
import type { MediaPickerLabels } from "@/components/admin/media/media-picker";
import type { EditorMedia } from "@/components/admin/rich-text-editor";
import { StatusField } from "@/components/admin/taxonomy/destination-form";
import { errorPaths, localeErrorState, tabForErrors } from "@/components/admin/taxonomy/form-parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { toast } from "@/components/ui/toaster";
import { savePageAction } from "@/modules/content/content.actions";
import { type PageInput, pageSchema } from "@/modules/content/content.schemas";

import { ContentTranslationFields, type ContentTranslationForm } from "./content-translation-fields";
import { useContentErrorText } from "./use-content-error-text";

type Props = {
  initial: PageInput;
  pageId: string | null;
  media: EditorMedia;
  /** Null for pages with a fixed route (about, FAQ). */
  prefixes: Record<"vi" | "en", string> | null;
  pickerLabels: MediaPickerLabels;
};

/** Edit one of the fixed static pages (spec Phase 2 step 18). */
export function PageEditor({ initial, pageId, media, prefixes, pickerLabels }: Props) {
  const t = useTranslations("Admin.Content");
  const tf = useTranslations("Admin.Form");
  const router = useRouter();
  const errorText = useContentErrorText();
  const [alert, setAlert] = useState<string | null>(null);
  const [tab, setTab] = useState<"vi" | "en">("vi");
  const form = useForm<PageInput>({
    resolver: zodResolver(pageSchema, undefined, { raw: true }),
    defaultValues: initial,
  });
  const published = { vi: form.watch("translations.vi.isPublished"), en: form.watch("translations.en.isPublished") };

  function revealErrors(paths: string[]) {
    const locale = tabForErrors(paths);
    if (!locale) return;
    setTab(locale);
    requestAnimationFrame(() => form.setFocus(paths[0] as Parameters<typeof form.setFocus>[0]));
  }

  async function onSubmit(values: PageInput) {
    setAlert(null);
    const result = await savePageAction(values);
    if (!result.ok) {
      const fields = { ...result.fields, ...(result.field ? { [result.field]: result.error } : {}) };
      for (const [name, message] of Object.entries(fields)) {
        form.setError(name as Parameters<typeof form.setError>[0], { type: "server", message });
      }
      setAlert(Object.keys(fields).length ? t("errors.fixFields") : errorText(result.error));
      revealErrors(Object.keys(fields));
      return;
    }
    toast({ title: t("saved"), variant: "success" });
    router.refresh();
  }

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit, (errors) => {
          setAlert(null);
          requestAnimationFrame(() => setAlert(t("errors.fixFields")));
          revealErrors(errorPaths(errors));
        })}
        className="flex max-w-4xl flex-col gap-8"
      >
        {alert && (
          <Alert variant="destructive" live="assertive">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <StatusField form={form} />
        </div>
        <LocaleTabs
          value={tab}
          onValueChange={setTab}
          state={localeErrorState(form.formState.errors, published)}
          labels={{ vi: tf("vi"), en: tf("en"), published: tf("published"), unpublished: tf("unpublished"), missing: tf("missing") }}
        >
          {(locale) => (
            <ContentTranslationFields
              form={form as unknown as UseFormReturn<ContentTranslationForm, unknown, unknown>}
              locale={locale}
              kind="page"
              ownerId={pageId ?? undefined}
              prefix={prefixes ? prefixes[locale] : null}
              media={media}
              pickerLabels={pickerLabels}
            />
          )}
        </LocaleTabs>
        <div className="flex justify-end border-t border-border pt-6">
          <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
