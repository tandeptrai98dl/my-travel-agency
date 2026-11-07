"use client";

import "@/lib/zod-config";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { updateContactAction } from "@/modules/booking/booking-admin.actions";
import { type UpdateContactInput, updateContactSchema } from "@/modules/booking/booking-admin.schemas";

import { applyServerErrors } from "./fields";
import { useBookingErrorText } from "./use-booking-error-text";

/** Contact details and special requests: the only booking columns staff may write (column grants). */
export function ContactForm({ defaults }: { defaults: UpdateContactInput }) {
  const t = useTranslations("Admin.BookingDetail");
  const errorText = useBookingErrorText();
  const router = useRouter();
  const id = useId();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<UpdateContactInput>({
    resolver: zodResolver(updateContactSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });

  async function onSubmit(values: UpdateContactInput) {
    setAlert(null);
    const result = await updateContactAction(values);
    if (!result.ok) {
      const key = applyServerErrors(result, (name, message) =>
        form.setError(name as keyof UpdateContactInput, { type: "server", message }),
      );
      if (key) setAlert(errorText(key));
      return;
    }
    toast({ title: t("contactSaved"), variant: "success" });
    form.reset(values);
    router.refresh();
  }

  const text = (name: "contactName" | "contactEmail" | "contactPhone", label: string, type = "text", max = 120) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} autoComplete="off" maxLength={max} {...field} />
          </FormControl>
          <FormMessage formatMessage={errorText} />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="font-sans text-h4 font-semibold">
          {t("editContact")}
        </h3>
        {alert && (
          <Alert variant="destructive" live="assertive">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {text("contactName", t("contactName"))}
          {text("contactEmail", t("contactEmail"), "email", 200)}
          {text("contactPhone", t("contactPhone"), "tel", 30)}
        </div>
        <FormField
          control={form.control}
          name="specialRequests"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("specialRequests")}</FormLabel>
              <FormControl>
                <Textarea rows={3} maxLength={1000} {...field} />
              </FormControl>
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" variant="outline" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("saving") : t("saveContact")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
