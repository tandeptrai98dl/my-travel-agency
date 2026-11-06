"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { SlugInput } from "@/components/admin/slug-input";
import { NumberField } from "@/components/admin/taxonomy/destination-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { saveCategoryAction } from "@/modules/content/content.actions";
import { type CategoryInput, categorySchema } from "@/modules/content/content.schemas";

import { useContentErrorText } from "./use-content-error-text";

type Props = {
  initial: CategoryInput;
  prefixes: Record<"vi" | "en", string>;
  deleteAction?: React.ReactNode;
};

/** A journal topic: VI/EN name and slug (no publish flag; it shows once articles use it). */
export function CategoryForm({ initial, prefixes, deleteAction }: Props) {
  const t = useTranslations("Admin.Content");
  const tf = useTranslations("Admin.Form");
  const router = useRouter();
  const errorText = useContentErrorText();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema, undefined, { raw: true }),
    defaultValues: initial,
  });

  async function onSubmit(values: CategoryInput) {
    setAlert(null);
    const result = await saveCategoryAction(values);
    if (!result.ok) {
      const fields = { ...result.fields, ...(result.field ? { [result.field]: result.error } : {}) };
      for (const [name, message] of Object.entries(fields)) {
        form.setError(name as Parameters<typeof form.setError>[0], { type: "server", message });
      }
      setAlert(Object.keys(fields).length ? t("errors.fixFields") : errorText(result.error));
      return;
    }
    toast({ title: t("saved"), variant: "success" });
    if (!initial.id) router.push("/admin/journal/categories");
    else router.refresh();
  }

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit, () => {
          setAlert(null);
          requestAnimationFrame(() => setAlert(t("errors.fixFields")));
        })}
        className="flex max-w-3xl flex-col gap-8"
      >
        {alert && (
          <Alert variant="destructive" live="assertive">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        {(["vi", "en"] as const).map((locale) => (
          <fieldset key={locale} className="flex flex-col gap-4">
            <legend className="mb-4 font-serif text-h3 font-semibold">{tf(locale)}</legend>
            <FormField
              control={form.control}
              name={`translations.${locale}.name`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("categoryName", { language: tf(locale) })}</FormLabel>
                  <FormControl>
                    <Input maxLength={80} {...field} />
                  </FormControl>
                  <FormMessage formatMessage={errorText} />
                </FormItem>
              )}
            />
            <Controller
              control={form.control}
              name={`translations.${locale}.slug`}
              render={({ field, fieldState }) => (
                <SlugInput
                  inputRef={field.ref}
                  value={field.value}
                  onChange={field.onChange}
                  source={form.watch(`translations.${locale}.name`)}
                  prefix={prefixes[locale]}
                  error={fieldState.error?.message ? errorText(fieldState.error.message) : undefined}
                  labels={{
                    label: t("categorySlug", { language: tf(locale) }),
                    hint: tf("slugHint"),
                    generate: tf("generateSlug"),
                    invalid: tf("slugInvalid"),
                  }}
                />
              )}
            />
          </fieldset>
        ))}
        <div className="max-w-xs">
          <NumberField form={form} name="sortOrder" label={t("sortOrder")} step="1" required />
        </div>
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
