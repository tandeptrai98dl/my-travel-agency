"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { LocaleTabs } from "@/components/admin/locale-tabs";
import type { MediaPickerLabels } from "@/components/admin/media/media-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { saveTravelStyleAction } from "@/modules/catalog/taxonomy/taxonomy.actions";
import {
  type TravelStyleInput,
  type TravelStyleValues,
  travelStyleSchema,
} from "@/modules/catalog/taxonomy/taxonomy.schemas";

import { NumberField, StatusField } from "./destination-form";
import { HeroField, type HeroSummary, localeErrorState, useActionErrors, useErrorText } from "./form-parts";
import { TranslationFields, type TranslationForm } from "./translation-fields";

type Props = {
  initial: TravelStyleInput;
  hero: HeroSummary;
  prefixes: Record<"vi" | "en", string>;
  pickerLabels: MediaPickerLabels;
  deleteAction?: React.ReactNode;
};

/** Create or edit a travel style (spec Phase 2 step 9). */
export function TravelStyleForm({ initial, hero, prefixes, pickerLabels, deleteAction }: Props) {
  const t = useTranslations("Admin.Taxonomy");
  const tf = useTranslations("Admin.Form");
  const router = useRouter();
  const errorText = useErrorText();
  const applyErrors = useActionErrors();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<TravelStyleInput, unknown, TravelStyleValues>({
    resolver: zodResolver(travelStyleSchema),
    defaultValues: initial,
  });
  const published = { vi: form.watch("translations.vi.isPublished"), en: form.watch("translations.en.isPublished") };

  async function onSubmit(values: TravelStyleValues) {
    setAlert(null);
    const result = await saveTravelStyleAction(values);
    if (!result.ok) {
      setAlert(applyErrors(form, result));
      return;
    }
    toast({ title: t("saved"), variant: "success" });
    if (!initial.id && result.id) router.push(`/admin/travel-styles/${result.id}`);
    else router.refresh();
  }

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit, () => setAlert(t("fixErrors")))}
        className="flex max-w-3xl flex-col gap-8"
      >
        {alert && (
          <Alert variant="destructive" live="assertive">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("key")}</FormLabel>
                <FormControl>
                  <Input
                    maxLength={60}
                    spellCheck={false}
                    autoCapitalize="off"
                    {...field}
                    onChange={(event) => field.onChange(event.target.value.toLowerCase())}
                  />
                </FormControl>
                <FormDescription>{t("keyHint")}</FormDescription>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          <StatusField form={form} />
          <NumberField
            form={form}
            name="sortOrder"
            label={t("sortOrder")}
            hint={t("sortOrderHint")}
            step="1"
            required
          />
        </div>
        <FormField
          control={form.control}
          name="heroMediaId"
          render={({ field, fieldState }) => (
            <HeroField
              id="travel-style-hero"
              value={field.value}
              onChange={field.onChange}
              initial={hero}
              pickerLabels={pickerLabels}
              error={fieldState.error?.message ? errorText(fieldState.error.message) : undefined}
            />
          )}
        />
        <LocaleTabs
          state={localeErrorState(form.formState.errors, published)}
          labels={{
            vi: tf("vi"),
            en: tf("en"),
            published: tf("published"),
            unpublished: tf("unpublished"),
            missing: tf("missing"),
          }}
        >
          {(locale) => (
            <TranslationFields
              form={form as unknown as UseFormReturn<TranslationForm, unknown, unknown>}
              locale={locale}
              kind="travelStyle"
              prefix={prefixes[locale]}
            />
          )}
        </LocaleTabs>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          {deleteAction ?? <span />}
          <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
