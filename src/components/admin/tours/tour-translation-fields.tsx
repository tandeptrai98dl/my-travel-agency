"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef } from "react";
import { Controller, useFieldArray, type UseFormReturn } from "react-hook-form";

import { ListEditor, type ListEditorLabels } from "@/components/admin/list-editor";
import type { MediaPickerLabels } from "@/components/admin/media/media-picker";
import { SeoFields } from "@/components/admin/seo-fields";
import { SlugInput } from "@/components/admin/slug-input";
import { HeroField } from "@/components/admin/taxonomy/form-parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { checkTourSlugAction } from "@/modules/catalog/tours/tours.actions";
import { MEALS, type TourInput } from "@/modules/catalog/tours/tours.schemas";
import type { MediaSummary } from "@/modules/catalog/tours/tours.service";

import { focusAfterMove, focusAfterRemove, RowControls, useAnnouncer } from "./row-controls";
import { useTourErrorText } from "./use-tour-error-text";

type Props = {
  form: UseFormReturn<TourInput>;
  locale: "vi" | "en";
  prefix: string;
  media: Record<string, MediaSummary>;
  pickerLabels: MediaPickerLabels;
};

/** One language of a tour: texts, itinerary, lists, FAQs, SEO, sharing image and its publish switch. */
export function TourTranslationFields({ form, locale, prefix, media, pickerLabels }: Props) {
  const t = useTranslations("Admin.Tours");
  const tf = useTranslations("Admin.Form");
  const errorText = useTourErrorText();
  const id = useId();
  const base = `translations.${locale}` as const;
  const title = form.watch(`${base}.title`);
  const slugCheck = useRef(0);
  const days = useFieldArray({ control: form.control, name: `${base}.itinerary` });
  const faqs = useFieldArray({ control: form.control, name: `${base}.faqs` });
  const daysRef = useRef<HTMLOListElement>(null);
  const faqsRef = useRef<HTMLOListElement>(null);
  const addDayRef = useRef<HTMLButtonElement>(null);
  const addFaqRef = useRef<HTMLButtonElement>(null);
  const { announce, region } = useAnnouncer();
  const errors = form.formState.errors.translations?.[locale];
  const language = tf(locale);

  const listLabels: ListEditorLabels = {
    add: tf("addItem"),
    item: tf.raw("item") as string,
    remove: tf.raw("removeItem") as string,
    moveUp: tf.raw("moveUp") as string,
    moveDown: tf.raw("moveDown") as string,
    moved: tf.raw("moved") as string,
    removed: tf.raw("removed") as string,
  };

  async function checkSlug() {
    const slug = form.getValues(`${base}.slug`);
    const request = ++slugCheck.current;
    if (!slug) return;
    const result = await checkTourSlugAction({ locale, slug, excludeId: form.getValues("id") });
    if (request !== slugCheck.current || form.getValues(`${base}.slug`) !== slug || !("available" in result)) return;
    if (!result.available) form.setError(`${base}.slug`, { type: "server", message: "slug_taken" });
    else if (form.getFieldState(`${base}.slug`).error?.message === "slug_taken") form.clearErrors(`${base}.slug`);
  }

  const textField = (name: "title" | "subtitle", label: string, max: number) => (
    <FormField
      control={form.control}
      name={`${base}.${name}`}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input maxLength={max} {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage formatMessage={errorText} />
        </FormItem>
      )}
    />
  );

  const listField = (name: "highlights" | "inclusions" | "exclusions", label: string) => (
    <Controller
      control={form.control}
      name={`${base}.${name}`}
      render={({ field, fieldState }) => (
        <div className="flex flex-col gap-2">
          <ListEditor label={label} value={field.value ?? []} onChange={field.onChange} labels={listLabels} />
          {fieldState.error?.message && (
            <p className="text-small font-medium text-destructive">{errorText(fieldState.error.message)}</p>
          )}
        </div>
      )}
    />
  );

  return (
    <div className="flex flex-col gap-8 pt-6">
      {region}
      {textField("title", t("tourTitle"), 160)}
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
              prefix={prefix}
              error={fieldState.error?.message ? errorText(fieldState.error.message) : undefined}
              labels={{ label: tf("slug"), hint: tf("slugHint"), generate: tf("generateSlug"), invalid: tf("slugInvalid") }}
            />
          </div>
        )}
      />
      {textField("subtitle", t("subtitle"), 200)}
      <FormField
        control={form.control}
        name={`${base}.summary`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("summary")}</FormLabel>
            <FormControl>
              <Textarea rows={3} maxLength={600} {...field} />
            </FormControl>
            <p className="text-small text-muted-foreground">{t("summaryHint")}</p>
            <FormMessage formatMessage={errorText} />
          </FormItem>
        )}
      />
      {listField("highlights", t("highlights"))}

      <section aria-labelledby={`${id}-itinerary`} className="flex flex-col gap-4">
        <h3 id={`${id}-itinerary`} className="font-sans text-h4 font-semibold">
          {t("itinerary")}
        </h3>
        {days.fields.length === 0 && <p className="text-small text-muted-foreground">{t("noDays")}</p>}
        <ol ref={daysRef} className="flex flex-col gap-4">
          {days.fields.map((day, index) => (
            <li key={day.id} data-row className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-medium">{t("day", { index: index + 1 })}</p>
                <RowControls
                  index={index}
                  count={days.fields.length}
                  labels={{
                    up: t("moveDayUp", { index: index + 1 }),
                    down: t("moveDayDown", { index: index + 1 }),
                    remove: t("removeDay", { index: index + 1 }),
                  }}
                  onMove={(from, to) => {
                    days.move(from, to);
                    announce(t("dayMoved", { from: from + 1, to: to + 1 }));
                    focusAfterMove(daysRef.current, to);
                  }}
                  onRemove={(at) => {
                    days.remove(at);
                    announce(t("dayRemoved", { index: at + 1 }));
                    focusAfterRemove(daysRef.current, at, addDayRef.current);
                  }}
                />
              </div>
              <FormField
                control={form.control}
                name={`${base}.itinerary.${index}.title`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dayTitle", { index: index + 1 })}</FormLabel>
                    <FormControl>
                      <Input maxLength={160} {...field} />
                    </FormControl>
                    <FormMessage formatMessage={errorText} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${base}.itinerary.${index}.description`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dayDescription", { index: index + 1 })}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} maxLength={2000} {...field} />
                    </FormControl>
                    <FormMessage formatMessage={errorText} />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Controller
                  control={form.control}
                  name={`${base}.itinerary.${index}.meals`}
                  render={({ field }) => (
                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-small font-medium">{t("meals")}</legend>
                      <div className="flex flex-wrap gap-4">
                        {MEALS.map((meal) => {
                          const checkboxId = `${id}-${day.id}-${meal}`;
                          const checked = field.value.includes(meal);
                          return (
                            <div key={meal} className="flex items-center gap-2">
                              <Checkbox
                                id={checkboxId}
                                checked={checked}
                                onCheckedChange={(next) =>
                                  field.onChange(
                                    next ? MEALS.filter((m) => m === meal || field.value.includes(m)) : field.value.filter((m) => m !== meal),
                                  )
                                }
                              />
                              <Label htmlFor={checkboxId}>{t(`mealNames.${meal}`)}</Label>
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`${base}.itinerary.${index}.accommodation`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("accommodation")}</FormLabel>
                      <FormControl>
                        <Input maxLength={160} {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage formatMessage={errorText} />
                    </FormItem>
                  )}
                />
              </div>
              <Controller
                control={form.control}
                name={`${base}.itinerary.${index}.mediaId`}
                render={({ field, fieldState }) => (
                  <HeroField
                    id={`${id}-${day.id}-image`}
                    legend={t("dayImage")}
                    value={field.value ?? null}
                    onChange={field.onChange}
                    initial={field.value ? (media[field.value] ?? null) : null}
                    pickerLabels={pickerLabels}
                    error={fieldState.error?.message ? errorText(fieldState.error.message) : undefined}
                  />
                )}
              />
            </li>
          ))}
        </ol>
        <div>
          <Button
            ref={addDayRef}
            type="button"
            variant="outline"
            disabled={days.fields.length >= 60}
            onClick={() => days.append({ title: "", description: "", meals: [], accommodation: "", mediaId: null })}
          >
            <Plus strokeWidth={1.5} aria-hidden="true" />
            {t("addDay")}
          </Button>
        </div>
      </section>

      {listField("inclusions", t("inclusions"))}
      {listField("exclusions", t("exclusions"))}
      <FormField
        control={form.control}
        name={`${base}.practicalInfo`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("practicalInfo")}</FormLabel>
            <FormControl>
              <Textarea rows={5} maxLength={4000} {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage formatMessage={errorText} />
          </FormItem>
        )}
      />

      <section aria-labelledby={`${id}-faqs`} className="flex flex-col gap-4">
        <h3 id={`${id}-faqs`} className="font-sans text-h4 font-semibold">
          {t("faqs")}
        </h3>
        <ol ref={faqsRef} className="flex flex-col gap-4">
          {faqs.fields.map((faq, index) => (
            <li key={faq.id} data-row className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex justify-end">
                <RowControls
                  index={index}
                  count={faqs.fields.length}
                  labels={{
                    up: tf("moveUp", { index: index + 1 }),
                    down: tf("moveDown", { index: index + 1 }),
                    remove: t("removeFaq", { index: index + 1 }),
                  }}
                  onMove={(from, to) => {
                    faqs.move(from, to);
                    announce(tf("moved", { from: from + 1, to: to + 1 }));
                    focusAfterMove(faqsRef.current, to);
                  }}
                  onRemove={(at) => {
                    faqs.remove(at);
                    announce(tf("removed", { index: at + 1 }));
                    focusAfterRemove(faqsRef.current, at, addFaqRef.current);
                  }}
                />
              </div>
              <FormField
                control={form.control}
                name={`${base}.faqs.${index}.question`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("question", { index: index + 1 })}</FormLabel>
                    <FormControl>
                      <Input maxLength={300} {...field} />
                    </FormControl>
                    <FormMessage formatMessage={errorText} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${base}.faqs.${index}.answer`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("answer", { index: index + 1 })}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} maxLength={2000} {...field} />
                    </FormControl>
                    <FormMessage formatMessage={errorText} />
                  </FormItem>
                )}
              />
            </li>
          ))}
        </ol>
        <div>
          <Button
            ref={addFaqRef}
            type="button"
            variant="outline"
            disabled={faqs.fields.length >= 20}
            onClick={() => faqs.append({ question: "", answer: "" })}
          >
            <Plus strokeWidth={1.5} aria-hidden="true" />
            {t("addFaq")}
          </Button>
        </div>
      </section>

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
        name={`${base}.ogMediaId`}
        render={({ field }) => (
          <div className="flex flex-col gap-2">
            <HeroField
              id={`${id}-og`}
              legend={t("ogImage")}
              value={field.value}
              onChange={field.onChange}
              initial={field.value ? (media[field.value] ?? null) : null}
              pickerLabels={pickerLabels}
            />
            <p className="text-small text-muted-foreground">{t("ogImageHint")}</p>
          </div>
        )}
      />
      <Controller
        control={form.control}
        name={`${base}.isPublished`}
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-2 border-t border-border pt-6">
            <div className="flex items-center gap-3">
              <Switch
                ref={field.ref}
                id={`${id}-publish`}
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-describedby={`${id}-publish-error`}
              />
              <Label htmlFor={`${id}-publish`}>
                {t("publishLanguage", { language: language.charAt(0).toLowerCase() + language.slice(1) })}
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
