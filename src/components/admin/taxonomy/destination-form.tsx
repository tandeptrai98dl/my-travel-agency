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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { saveDestinationAction } from "@/modules/catalog/taxonomy/taxonomy.actions";
import {
  type DestinationInput,
  type DestinationValues,
  destinationSchema,
} from "@/modules/catalog/taxonomy/taxonomy.schemas";

import { HeroField, type HeroSummary, localeErrorState, useActionErrors, useErrorText } from "./form-parts";
import { TranslationFields, type TranslationForm } from "./translation-fields";

export type ParentOption = { id: string; type: "country" | "region"; label: string };

type Props = {
  initial: DestinationInput;
  hero: HeroSummary;
  parents: ParentOption[];
  prefixes: Record<"vi" | "en", string>;
  pickerLabels: MediaPickerLabels;
  /** Delete button for an existing destination (rendered by the page). */
  deleteAction?: React.ReactNode;
};

const NONE = "none";
const PARENT_TYPE = { country: null, region: "country", city: "region" } as const;

/** Create or edit a destination (spec Phase 2 step 8): tree position, key, hero image, VI/EN text. */
export function DestinationForm({ initial, hero, parents, prefixes, pickerLabels, deleteAction }: Props) {
  const t = useTranslations("Admin.Taxonomy");
  const tf = useTranslations("Admin.Form");
  const router = useRouter();
  const errorText = useErrorText();
  const applyErrors = useActionErrors();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<DestinationInput, unknown, DestinationValues>({
    resolver: zodResolver(destinationSchema),
    defaultValues: initial,
  });
  const type = form.watch("type");
  const parentType = PARENT_TYPE[type];
  const parentOptions = parents.filter((option) => option.type === parentType && option.id !== initial.id);
  const published = { vi: form.watch("translations.vi.isPublished"), en: form.watch("translations.en.isPublished") };

  async function onSubmit(values: DestinationValues) {
    setAlert(null);
    const result = await saveDestinationAction(values);
    if (!result.ok) {
      setAlert(applyErrors(form, result));
      return;
    }
    toast({ title: t("saved"), variant: "success" });
    if (!initial.id && result.id) router.push(`/admin/destinations/${result.id}`);
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
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("type")}</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (value === "country") form.setValue("parentId", null);
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(["country", "region", "city"] as const).map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`types.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="parentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("parent")}</FormLabel>
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(value) => field.onChange(value === NONE ? null : value)}
                  disabled={type === "country"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("noParent")}</SelectItem>
                    {parentOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
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
          <NumberField form={form} name="latitude" label={t("latitude")} step="0.000001" />
          <NumberField form={form} name="longitude" label={t("longitude")} step="0.000001" />
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
              id="destination-hero"
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
              kind="destination"
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

type StatusForm = UseFormReturn<{ status: "draft" | "published" | "archived" }, unknown, unknown>;

/** Draft / published / archived select, shared with the travel-style form. */
export function StatusField<T extends { status: "draft" | "published" | "archived" }>({
  form,
}: {
  form: UseFormReturn<T, unknown, unknown>;
}) {
  const t = useTranslations("Admin.Taxonomy");
  const errorText = useErrorText();
  const typed = form as unknown as StatusForm;
  return (
    <FormField
      control={typed.control}
      name="status"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("status")}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
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
          <FormDescription>{t("statusHint")}</FormDescription>
          <FormMessage formatMessage={errorText} />
        </FormItem>
      )}
    />
  );
}

type NumberForm = UseFormReturn<Record<string, number | null>, unknown, unknown>;

/** Number input that stores `null` when empty (coordinates) or a number. */
export function NumberField<T extends object>({
  form,
  name,
  label,
  hint,
  step,
  required,
}: {
  form: UseFormReturn<T, unknown, unknown>;
  name: string;
  label: string;
  hint?: string;
  step: string;
  required?: boolean;
}) {
  const errorText = useErrorText();
  const typed = form as unknown as NumberForm;
  return (
    <FormField
      control={typed.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              inputMode="decimal"
              step={step}
              ref={field.ref}
              name={field.name}
              onBlur={field.onBlur}
              value={field.value ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                field.onChange(raw === "" ? (required ? Number.NaN : null) : Number(raw));
              }}
            />
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage formatMessage={errorText} />
        </FormItem>
      )}
    />
  );
}
