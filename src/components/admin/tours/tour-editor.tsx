"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { LocaleTabs } from "@/components/admin/locale-tabs";
import type { MediaPickerLabels } from "@/components/admin/media/media-picker";
import { MoneyInput } from "@/components/admin/money-input";
import { NumberField } from "@/components/admin/taxonomy/destination-form";
import { errorPaths, HeroField, localeErrorState, tabForErrors } from "@/components/admin/taxonomy/form-parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { formatVnd } from "@/lib/money";
import { saveTourAction } from "@/modules/catalog/tours/tours.actions";
import { emptyTourTranslation, type TourInput, tourSchema } from "@/modules/catalog/tours/tours.schemas";
import type { MediaSummary } from "@/modules/catalog/tours/tours.service";

import { GalleryField } from "./gallery-field";
import { RemoveLanguageButton } from "./remove-language-button";
import { TourTranslationFields } from "./tour-translation-fields";
import { useTourErrorText } from "./use-tour-error-text";

type Option = { id: string; label: string };

type Props = {
  initial: TourInput;
  media: Record<string, MediaSummary>;
  canEditPrices: boolean;
  activeDepartures: number;
  options: { destinations: Option[]; travelStyles: Option[]; policies: (Option & { isDefault: boolean })[] };
  prefixes: Record<"vi" | "en", string>;
  pickerLabels: MediaPickerLabels;
  /** Duplicate button (rendered by the page). */
  actions?: React.ReactNode;
};

/** The tour editor (spec Phase 2 step 13). Prices and terms are editable by admins only (ADR-024). */
export function TourEditor({ initial, media, canEditPrices, activeDepartures, options, prefixes, pickerLabels, actions }: Props) {
  const t = useTranslations("Admin.Tours");
  const tf = useTranslations("Admin.Form");
  const router = useRouter();
  const errorText = useTourErrorText();
  const id = useId();
  const [alert, setAlert] = useState<string | null>(null);
  const [tab, setTab] = useState<"vi" | "en">("vi");
  const form = useForm<TourInput>({
    // `raw`: submit what the editor typed; the Server Action parses (and transforms) it once.
    resolver: zodResolver(tourSchema, undefined, { raw: true }),
    defaultValues: { ...initial, prices: canEditPrices ? initial.prices : null },
  });
  const published = { vi: form.watch("translations.vi.isPublished"), en: form.watch("translations.en.isPublished") };
  // Languages stored for this tour (a saved language always has a title).
  const savedLocales = (["vi", "en"] as const).filter((locale) => initial.translations[locale].title !== "");

  function revealErrors(paths: string[]) {
    const locale = tabForErrors(paths);
    if (!locale) return;
    setTab(locale);
    requestAnimationFrame(() => form.setFocus(paths[0] as Parameters<typeof form.setFocus>[0]));
  }

  async function onSubmit(values: TourInput) {
    setAlert(null);
    const result = await saveTourAction(values);
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

  const checkboxList = (name: "destinationIds" | "travelStyleIds", legend: string, items: Option[]) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-small font-medium">{legend}</legend>
          <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-card p-3">
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const checkboxId = `${id}-${name}-${item.id}`;
                const checked = field.value.includes(item.id);
                return (
                  <li key={item.id} className="flex items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={checked}
                      onCheckedChange={(next) =>
                        field.onChange(next ? [...field.value, item.id] : field.value.filter((value) => value !== item.id))
                      }
                    />
                    <Label htmlFor={checkboxId} className="font-normal">
                      {item.label}
                    </Label>
                  </li>
                );
              })}
            </ul>
          </div>
        </fieldset>
      )}
    />
  );

  const section = (key: string, title: string, children: React.ReactNode) => (
    <section aria-labelledby={`${id}-${key}`} className="flex flex-col gap-6 border-t border-border pt-8">
      <h2 id={`${id}-${key}`} className="font-serif text-h3 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );

  const prices = initial.prices;
  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit, (errors) => {
          // Cleared first, so the same message is announced again on a second failed attempt.
          setAlert(null);
          requestAnimationFrame(() => setAlert(t("errors.fixFields")));
          revealErrors(errorPaths(errors));
        })}
        className="flex max-w-4xl flex-col gap-10"
      >
        {alert && (
          <Alert variant="destructive" live="assertive">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}

        {section(
          "general",
          t("sections.general"),
          <div className="grid gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("code")}</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={20}
                      spellCheck={false}
                      {...field}
                      onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormDescription>{t("codeHint")}</FormDescription>
                  <FormMessage formatMessage={errorText} />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <EnumSelect form={form} name="type" label={t("type")} options={(["group", "private"] as const).map((v) => [v, t(`types.${v}`)])} />
              <EnumSelect
                form={form}
                name="scope"
                label={t("scope")}
                options={(["domestic", "international"] as const).map((v) => [v, t(`scopes.${v}`)])}
              />
            </div>
            <NumberField form={form} name="durationDays" label={t("durationDays")} step="1" required />
            <NumberField form={form} name="durationNights" label={t("durationNights")} step="1" required />
            <NumberField form={form} name="minPax" label={t("minPax")} step="1" required />
            <NumberField form={form} name="maxPax" label={t("maxPax")} step="1" />
            <NumberField form={form} name="minPaxToOperate" label={t("minPaxToOperate")} step="1" />
            <div className="grid grid-cols-2 gap-4">
              <NumberField form={form} name="childAgeMax" label={t("childAgeMax")} step="1" required />
              <NumberField form={form} name="infantAgeMax" label={t("infantAgeMax")} step="1" required />
            </div>
            <FormField
              control={form.control}
              name="isFeatured"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3">
                  <FormControl>
                    <Checkbox ref={field.ref} checked={field.value} onCheckedChange={(next) => field.onChange(next === true)} />
                  </FormControl>
                  <FormLabel>{t("isFeatured")}</FormLabel>
                </FormItem>
              )}
            />
          </div>,
        )}

        {section(
          "prices",
          t("sections.prices"),
          canEditPrices ? (
            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="prices.fromPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fromPrice")}</FormLabel>
                    <FormControl>
                      <MoneyInput ref={field.ref} value={field.value ?? null} onChange={(value) => field.onChange(value ?? 0)} />
                    </FormControl>
                    <FormDescription>{t("fromPriceHint")}</FormDescription>
                    <FormMessage formatMessage={errorText} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="prices.cancellationPolicyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("cancellationPolicy")}</FormLabel>
                    <Select value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}>
                      <FormControl>
                        <SelectTrigger ref={field.ref}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">{t("noPolicy")}</SelectItem>
                        {options.policies.map((policy) => (
                          <SelectItem key={policy.id} value={policy.id}>
                            {policy.label}
                            {policy.isDefault && ` · ${t("defaultPolicy")}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage formatMessage={errorText} />
                  </FormItem>
                )}
              />
              <NumberField form={form} name="prices.depositPercent" label={t("depositPercent")} step="1" required />
              <NumberField form={form} name="prices.balanceDueDays" label={t("balanceDueDays")} step="1" required />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-small text-muted-foreground">{t("pricesReadOnly")}</p>
              {prices && (
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-small text-muted-foreground">{t("fromPrice")}</dt>
                    <dd className="font-medium">{formatVnd(prices.fromPrice, "vi")}</dd>
                  </div>
                  <div>
                    <dt className="text-small text-muted-foreground">{t("depositPercent")}</dt>
                    <dd className="font-medium">{prices.depositPercent}%</dd>
                  </div>
                  <div>
                    <dt className="text-small text-muted-foreground">{t("balanceDueDays")}</dt>
                    <dd className="font-medium">{prices.balanceDueDays}</dd>
                  </div>
                  <div>
                    <dt className="text-small text-muted-foreground">{t("cancellationPolicy")}</dt>
                    <dd className="font-medium">
                      {options.policies.find((policy) => policy.id === prices.cancellationPolicyId)?.label ?? t("noPolicy")}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          ),
        )}

        {section(
          "catalog",
          t("sections.catalog"),
          <div className="grid gap-6 md:grid-cols-2">
            {checkboxList("destinationIds", t("destinations"), options.destinations)}
            {checkboxList("travelStyleIds", t("travelStyles"), options.travelStyles)}
          </div>,
        )}

        {section(
          "media",
          t("sections.media"),
          <div className="flex flex-col gap-8">
            <FormField
              control={form.control}
              name="heroMediaId"
              render={({ field, fieldState }) => (
                <HeroField
                  id={`${id}-hero`}
                  legend={t("hero")}
                  value={field.value}
                  onChange={field.onChange}
                  initial={field.value ? (media[field.value] ?? null) : null}
                  pickerLabels={pickerLabels}
                  error={fieldState.error?.message ? errorText(fieldState.error.message) : undefined}
                />
              )}
            />
            <Controller
              control={form.control}
              name="galleryIds"
              render={({ field }) => (
                <GalleryField value={field.value} onChange={field.onChange} initial={media} pickerLabels={pickerLabels} />
              )}
            />
          </div>,
        )}

        {section(
          "content",
          t("sections.content"),
          <LocaleTabs
            value={tab}
            onValueChange={setTab}
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
              <div className="flex flex-col gap-6">
                <TourTranslationFields
                  form={form}
                  locale={locale}
                  prefix={prefixes[locale]}
                  media={media}
                  pickerLabels={pickerLabels}
                />
                {/* Saved languages only, and never the last one (the server checks again). */}
                {initial.id && savedLocales.includes(locale) && savedLocales.length > 1 && (
                  <div className="border-t border-border pt-4">
                    <RemoveLanguageButton
                      id={initial.id}
                      locale={locale}
                      languageName={tf(locale)}
                      published={initial.translations[locale].isPublished}
                      onRemoved={() => {
                        form.setValue(`translations.${locale}`, emptyTourTranslation(), { shouldDirty: false });
                        setTab(locale === "vi" ? "en" : "vi");
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </LocaleTabs>,
        )}

        {section(
          "publish",
          t("sections.publish"),
          <div className="flex flex-col gap-4">
            <p className="text-small text-muted-foreground">{t("publishRules")}</p>
            <p className="text-small">{t("activeDepartures", { count: activeDepartures })}</p>
            <div className="max-w-sm">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("status")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger ref={field.ref}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(["draft", "published", "archived"] as const).map((value) => (
                          <SelectItem key={value} value={value}>
                            {t(`statuses.${value}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage formatMessage={errorText} />
                  </FormItem>
                )}
              />
            </div>
          </div>,
        )}

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-4 border-t border-border bg-background px-4 py-4 md:-mx-8 md:px-8">
          {actions ?? <span />}
          <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function EnumSelect({
  form,
  name,
  label,
  options,
}: {
  form: ReturnType<typeof useForm<TourInput>>;
  name: "type" | "scope";
  label: string;
  options: [string, string][];
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger ref={field.ref}>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map(([value, text]) => (
                <SelectItem key={value} value={value}>
                  {text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>
      )}
    />
  );
}
