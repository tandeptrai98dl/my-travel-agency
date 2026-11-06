"use client";

import { useTranslations } from "next-intl";
import { useId, useRef } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";

import type { MediaPickerLabels } from "@/components/admin/media/media-picker";
import { type EditorMedia, RichTextEditor } from "@/components/admin/rich-text-editor";
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
  content?: unknown;
};
/** The part of the destination and travel-style forms these fields edit. */
export type TranslationForm = { id?: string; translations: Record<Locale, TranslationValues> };

type Props = {
  form: UseFormReturn<TranslationForm, unknown, unknown>;
  locale: Locale;
  kind: "destination" | "travelStyle";
  /** Public path before the slug for this language, e.g. "/en/destinations/". */
  prefix: string;
  /** Destinations: the rich text editor's image previews and media picker. */
  contentMedia?: EditorMedia;
  pickerLabels?: MediaPickerLabels;
};

/** One language of a destination or travel style: name, slug, text, SEO and its own publish switch. */
export function TranslationFields({ form, locale, kind, prefix, contentMedia = {}, pickerLabels }: Props) {
  const t = useTranslations("Admin.Taxonomy");
  const tf = useTranslations("Admin.Form");
  const errorText = useErrorText();
  const switchId = useId();
  /** Only the latest availability check may set or clear the error. */
  const slugCheck = useRef(0);
  const base = `translations.${locale}` as const;
  const name = form.watch(`${base}.name`);
  const seoErrors = form.formState.errors.translations?.[locale];
  const language = tf(locale);

  async function checkSlug() {
    const slug = form.getValues(`${base}.slug`);
    const request = ++slugCheck.current;
    if (!slug) return;
    const result = await checkSlugAction({ kind, locale, slug, excludeId: form.getValues("id") });
    // A newer check started, or the slug changed while this one ran.
    if (request !== slugCheck.current || form.getValues(`${base}.slug`) !== slug) return;
    if (!("available" in result)) return;
    if (!result.available) form.setError(`${base}.slug`, { type: "server", message: "slug_taken" });
    else if (form.getFieldState(`${base}.slug`).error?.message === "slug_taken") form.clearErrors(`${base}.slug`);
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
              inputRef={field.ref}
              value={field.value}
              onChange={(slug) => {
                slugCheck.current += 1;
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
          {pickerLabels && (
            <Controller
              control={form.control}
              name={`${base}.content`}
              render={({ field, fieldState }) => (
                <div className="flex flex-col gap-2">
                  <p id={`${switchId}-content-label`} className="text-small font-medium leading-none">
                    {t("content")}
                  </p>
                  <RichTextEditor
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    media={contentMedia}
                    pickerLabels={pickerLabels}
                    labelledBy={`${switchId}-content-label`}
                    describedBy={`${switchId}-content-hint ${switchId}-content-error`}
                    invalid={Boolean(fieldState.error)}
                  />
                  <p id={`${switchId}-content-hint`} className="text-small text-muted-foreground">
                    {t("contentHint")}
                  </p>
                  <p id={`${switchId}-content-error`} aria-live="polite" className="text-small font-medium text-destructive empty:hidden">
                    {fieldState.error?.message ? errorText(fieldState.error.message) : null}
                  </p>
                </div>
              )}
            />
          )}
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
        maxLength={{ title: 120, description: 300 }}
        errors={{
          title: seoErrors?.seoTitle?.message ? errorText(seoErrors.seoTitle.message) : undefined,
          description: seoErrors?.seoDescription?.message ? errorText(seoErrors.seoDescription.message) : undefined,
        }}
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
                ref={field.ref}
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
