"use client";

import "@/lib/zod-config";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { assignTransferAction } from "@/modules/payment/payment-admin.actions";
import { type AssignTransferInput, assignTransferSchema } from "@/modules/payment/payment-admin.schemas";

import { applyServerErrors } from "./fields";
import { useBookingErrorText } from "./use-booking-error-text";

/** Assigns one unmatched bank credit to a booking by its code; the amount is the bank's. */
export function AssignTransferForm({ eventId, labelledBy }: { eventId: string; labelledBy: string }) {
  const t = useTranslations("Admin.Payments");
  const detail = useTranslations("Admin.BookingDetail");
  const errorText = useBookingErrorText();
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<AssignTransferInput>({
    resolver: zodResolver(assignTransferSchema, undefined, { raw: true }),
    defaultValues: { eventId, bookingCode: "", note: "" },
  });

  async function onSubmit(values: AssignTransferInput) {
    setAlert(null);
    const result = await assignTransferAction(values);
    if (!result.ok) {
      const key = applyServerErrors(result, (name, message) =>
        form.setError(name as keyof AssignTransferInput, { type: "server", message }),
      );
      if (key) setAlert(errorText(key));
      return;
    }
    toast({ title: t("assigned", { reference: result.reference ?? "" }), variant: "success" });
    router.refresh();
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-labelledby={labelledBy} className="flex flex-col gap-3">
        {alert && (
          <Alert variant="destructive" live="assertive">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-start">
          <FormField
            control={form.control}
            name="bookingCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("bookingCode")}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" placeholder="PTA-2611-0042" maxLength={20} {...field} />
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{detail("noteLabel")}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" maxLength={500} {...field} />
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          <Button type="submit" className="sm:mt-7" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? detail("saving") : t("assign")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
