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
import { checkContentSlugAction } from "@/modules/content/content.actions";

import { useContentErrorText } from "./use-content-error-text";

type Locale = "vi" | "en";
type TranslationValues = {
  slug: string;
  title: string;
  excerpt?: string | null;
  content: unknown;
  seoTitle?: string | null;
  seoDescription?: string | null;
  isPublished: boolean;
};
/** The part of the article and page forms these fields edit. */
export type ContentTranslationForm = { translations: Record<Locale, TranslationValues> };

type Props = {
  form: UseFormReturn<ContentTranslationForm, unknown, unknown>;
  locale: Locale;
  kind: "post" | "page";
  /** Id of the article or page, so its own slugs count as free. */
  ownerId?: string;
  /** Public path before the slug, or null when the slug is not part of the URL (about, FAQ). */
  prefix: string | null;
  media: EditorMedia;
  pickerLabels: MediaPickerLabels;
};

/** One language of an article or page: title, slug, (excerpt), rich text, SEO and its publish switch. */
export function ContentTranslationFields({ form, locale, kind, ownerId, prefix, media, pickerLabels }: Props) {
  const t = useTranslations("Admin.Content");
  const tf = useTranslations("Admin.Form");
  const errorText = useContentErrorText();
  const id = useId();
  const slugCheck = useRef(0);
  const base = `translations.${locale}` as const;
  const title = form.watch(`${base}.title`);
  const errors = form.formState.errors.translations?.[locale];
  const language = tf(locale);

  async function checkSlug() {
    const slug = form.getValues(`${base}.slug`);
    const request = ++slugCheck.current;
    if (!slug) return;
    const result = await checkContentSlugAction({ kind, locale, slug, excludeId: ownerId });
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
        name={`${base}.title`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("titleField")}</FormLabel>
            <FormControl>
              <Input maxLength={160} {...field} />
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
              source={title}
              prefix={prefix ?? undefined}
              error={fieldState.error?.message ? errorText(fieldState.error.message) : undefined}
              labels={{
                label: tf("slug"),
                hint: prefix === null ? t("slugFixedRoute") : tf("slugHint"),
                generate: tf("generateSlug"),
                invalid: tf("slugInvalid"),
              }}
            />
          </div>
        )}
      />
      {kind === "post" && (
        <FormField
          control={form.control}
          name={`${base}.excerpt`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("excerpt")}</FormLabel>
              <FormControl>
                <Textarea rows={3} maxLength={400} {...field} value={field.value ?? ""} />
              </FormControl>
              <p className="text-small text-muted-foreground">{t("excerptHint")}</p>
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />
      )}
      <Controller
        control={form.control}
        name={`${base}.content`}
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-2">
            <p id={`${id}-content-label`} className="text-small font-medium leading-none">
              {t("contentField")}
            </p>
            <RichTextEditor
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              media={media}
              pickerLabels={pickerLabels}
              labelledBy={`${id}-content-label`}
              describedBy={`${id}-content-error`}
              invalid={Boolean(fieldState.error)}
            />
            <p id={`${id}-content-error`} aria-live="polite" className="text-small font-medium text-destructive empty:hidden">
              {fieldState.error?.message ? errorText(fieldState.error.message) : null}
            </p>
          </div>
        )}
      />
      <SeoFields
        title={form.watch(`${base}.seoTitle`) ?? ""}
        description={form.watch(`${base}.seoDescription`) ?? ""}
        onTitleChange={(value) => form.setValue(`${base}.seoTitle`, value, { shouldDirty: true })}
        onDescriptionChange={(value) => form.setValue(`${base}.seoDescription`, value, { shouldDirty: true })}
        maxLength={{ title: 120, description: 300 }}
        errors={{
          title: errors?.seoTitle?.message ? errorText(errors.seoTitle.message) : undefined,
          description: errors?.seoDescription?.message ? errorText(errors.seoDescription.message) : undefined,
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
                id={`${id}-publish`}
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-describedby={`${id}-publish-error`}
              />
              <Label htmlFor={`${id}-publish`}>
                {t("publishLocale", { language: language.charAt(0).toLowerCase() + language.slice(1) })}
              </Label>
            </div>
            <p id={`${id}-publish-error`} aria-live="polite" className="text-small font-medium text-destructive empty:-mt-2">
              {fieldState.error?.message ? errorText(fieldState.error.message) : null}
            </p>
          </div>
        )}
      />
    </div>
  );
}
