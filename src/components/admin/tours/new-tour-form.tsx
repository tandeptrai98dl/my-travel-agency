"use client";

import "@/lib/zod-config";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { NumberField } from "@/components/admin/taxonomy/destination-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTourAction } from "@/modules/catalog/tours/tours.actions";
import { type NewTourInput, newTourSchema } from "@/modules/catalog/tours/tours.schemas";

import { useTourErrorText } from "./use-tour-error-text";

/** The short form that creates a draft (spec Phase 2 step 12); the editor fills in the rest. */
export function NewTourForm() {
  const t = useTranslations("Admin.Tours");
  const router = useRouter();
  const errorText = useTourErrorText();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<NewTourInput>({
    resolver: zodResolver(newTourSchema, undefined, { raw: true }),
    defaultValues: { code: "", type: "group", scope: "domestic", durationDays: 3, durationNights: 2, title: "" },
  });

  async function onSubmit(values: NewTourInput) {
    setAlert(null);
    const result = await createTourAction(values);
    if (!result.ok) {
      const fields = { ...result.fields, ...(result.field ? { [result.field]: result.error } : {}) };
      for (const [name, message] of Object.entries(fields)) {
        form.setError(name as keyof NewTourInput, { type: "server", message });
      }
      setAlert(Object.keys(fields).length ? null : errorText(result.error));
      return;
    }
    router.push(`/admin/tours/${result.id}`);
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-3xl gap-6 md:grid-cols-2">
        {alert && (
          <Alert variant="destructive" live="assertive" className="md:col-span-2">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>{t("titleVi")}</FormLabel>
              <FormControl>
                <Input maxLength={160} {...field} />
              </FormControl>
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />
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
                  autoCapitalize="characters"
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
        <p className="text-small text-muted-foreground md:col-span-2">{t("createHint")}</p>
        <div className="md:col-span-2">
          <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {t("create")}
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
  form: ReturnType<typeof useForm<NewTourInput>>;
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
