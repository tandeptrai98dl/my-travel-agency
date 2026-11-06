"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";

import { SeoFields } from "@/components/admin/seo-fields";
import { SlugInput } from "@/components/admin/slug-input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { checkSlugAction } from "@/modules/catalog/taxonomy/taxonomy.actions";

import { useErrorText } from "./form-parts";

type Locale = "vi" | "en";
type TranslationValues = {
  slug: string;
  name: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  isPublished: boolean;
  summary?: string | null;
  bestTimeToVisit?: string | null;
  description?: string | null;
};
/** The part of the destination and travel-style forms these fields edit. */
export type TranslationForm = { id?: string; translations: Record<Locale, TranslationValues> };

type Props = {
  form: UseFormReturn<TranslationForm, unknown, unknown>;
  locale: Locale;
  kind: "destination" | "travelStyle";
  /** Public path before the slug for this language, e.g. "/en/destinations/". */
  prefix: string;
};

/** One language of a destination or travel style: name, slug, text, SEO and its own publish switch. */
export function TranslationFields({ form, locale, kind, prefix }: Props) {
  const t = useTranslations("Admin.Taxonomy");
  const tf = useTranslations("Admin.Form");
  const errorText = useErrorText();
  const switchId = useId();
  const base = `translations.${locale}` as const;
  const name = form.watch(`${base}.name`);
  const language = tf(locale);

  async function checkSlug() {
    const slug = form.getValues(`${base}.slug`);
    if (!slug) return;
    const result = await checkSlugAction({ kind, locale, slug, excludeId: form.getValues("id") });
    if ("available" in result && !result.available) {
      form.setError(`${base}.slug`, { type: "server", message: "slug_taken" });
    }
  }

  return (
    <div className="flex flex-col gap-6 pt-6">
      <p className="text-small text-muted-foreground">{t("localeEmptyHint")}</p>
      <FormField
        control={form.control}
        name={`${base}.name`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("name")}</FormLabel>
            <FormControl>
              <Input maxLength={120} {...field} />
            </FormControl>
            <FormMessage formatMessage={errorText} />
          </FormItem>
        )}
      />
      <Controller
        control={form.control}
        name={`${base}.slug`}
        render={({ field, fieldState }) => (
          <div onBlur={() => void checkSlug()}>
            <SlugInput
              value={field.value}
              onChange={(slug) => {
                field.onChange(slug);
                form.clearErrors(`${base}.slug`);
              }}
              source={name}
              prefix={prefix}
              error={fieldState.error?.message ? errorText(fieldState.error.message) : undefined}
              labels={{
                label: tf("slug"),
                hint: tf("slugHint"),
                generate: tf("generateSlug"),
                invalid: tf("slugInvalid"),
              }}
            />
          </div>
        )}
      />
      {kind === "destination" ? (
        <>
          <FormField
            control={form.control}
            name={`${base}.summary`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("summary")}</FormLabel>
                <FormControl>
                  <Textarea rows={3} maxLength={400} {...field} value={field.value ?? ""} />
                </FormControl>
                <p className="text-small text-muted-foreground">{t("summaryHint")}</p>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`${base}.bestTimeToVisit`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("bestTime")}</FormLabel>
                <FormControl>
                  <Input maxLength={200} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
        </>
      ) : (
        <FormField
          control={form.control}
          name={`${base}.description`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("description")}</FormLabel>
              <FormControl>
                <Textarea rows={5} maxLength={600} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />
      )}
      <SeoFields
        title={form.watch(`${base}.seoTitle`) ?? ""}
        description={form.watch(`${base}.seoDescription`) ?? ""}
        onTitleChange={(value) => form.setValue(`${base}.seoTitle`, value, { shouldDirty: true })}
        onDescriptionChange={(value) => form.setValue(`${base}.seoDescription`, value, { shouldDirty: true })}
        labels={{
          title: tf("seoTitle"),
          description: tf("seoDescription"),
          count: tf.raw("charCount") as string,
          tooLong: tf("tooLong"),
        }}
      />
      <Controller
        control={form.control}
        name={`${base}.isPublished`}
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Switch
                id={switchId}
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-describedby={`${switchId}-error`}
              />
              <Label htmlFor={switchId}>{t("publishLocale", { language: language.charAt(0).toLowerCase() + language.slice(1) })}</Label>
            </div>
            <p
              id={`${switchId}-error`}
              aria-live="polite"
              className="text-small font-medium text-destructive empty:-mt-2"
            >
              {fieldState.error?.message ? errorText(fieldState.error.message) : null}
            </p>
          </div>
        )}
      />
    </div>
  );
}
