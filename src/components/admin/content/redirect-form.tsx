"use client";

import "@/lib/zod-config";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { createRedirectAction } from "@/modules/content/redirects.actions";
import { type RedirectInput, redirectSchema } from "@/modules/content/redirects.schemas";

import { useContentErrorText } from "./use-content-error-text";

type Failure = { ok: false; error: string; field?: string; fields?: Record<string, string> };

/** Add a redirect (spec Phase 2 step 20). Slug changes add their own automatically (decision 4). */
export function RedirectForm({ redisConfigured }: { redisConfigured: boolean }) {
  const t = useTranslations("Admin.Content.redirects");
  const errorText = useContentErrorText();
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<RedirectInput>({
    resolver: zodResolver(redirectSchema, undefined, { raw: true }),
    defaultValues: { fromPath: "", toPath: "", statusCode: 301 },
  });

  async function onSubmit(values: RedirectInput) {
    setAlert(null);
    const result = await createRedirectAction(values);
    if (!result.ok) {
      const failure = result as Failure;
      const fields = { ...failure.fields, ...(failure.field ? { [failure.field]: failure.error } : {}) };
      for (const [name, message] of Object.entries(fields)) {
        form.setError(name as keyof RedirectInput, { type: "server", message });
      }
      setAlert(Object.keys(fields).length ? null : errorText(failure.error));
      return;
    }
    const synced = (result as { synced: boolean }).synced;
    toast({ title: t("created"), description: redisConfigured && !synced ? t("syncFailed") : undefined, variant: "success" });
    form.reset();
    router.refresh();
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-[1fr_1fr_12rem_auto] md:items-start">
        {alert && (
          <Alert variant="destructive" live="assertive" className="md:col-span-4">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        {(["fromPath", "toPath"] as const).map((name) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t(name)}</FormLabel>
                <FormControl>
                  <Input spellCheck={false} autoCapitalize="off" maxLength={500} placeholder={t(`${name}Placeholder`)} {...field} />
                </FormControl>
                <FormDescription>{t(`${name}Hint`)}</FormDescription>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
        ))}
        <FormField
          control={form.control}
          name="statusCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("statusCode")}</FormLabel>
              <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                <FormControl>
                  <SelectTrigger ref={field.ref}>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="301">{t("permanent")}</SelectItem>
                  <SelectItem value="302">{t("temporary")}</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <div className="md:pt-7">
          <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {t("add")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
