"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";

import { MoneyInput } from "@/components/admin/money-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { formatVnd } from "@/lib/money";
import { recordManualPaymentAction, recordRefundAction } from "@/modules/payment/payment-admin.actions";
import {
  MANUAL_METHODS,
  type ManualPaymentInput,
  manualPaymentSchema,
  REFUND_METHODS,
  refundSchema,
} from "@/modules/payment/payment-admin.schemas";

import { applyServerErrors, selectClass } from "./fields";
import { useBookingErrorText } from "./use-booking-error-text";

type Props = { bookingId: string; kind: "payment" | "refund"; defaultAmount: number | null; maxAmount?: number };

/**
 * Manual payment or refund by an MFA-verified accountant or admin, always with a note
 * (spec Phase 4 step 17). The server checks the role, caps refunds and records the audit row.
 */
export function MoneyActionForm({ bookingId, kind, defaultAmount, maxAmount }: Props) {
  const t = useTranslations("Admin.BookingDetail");
  const methods = useTranslations("Admin.Bookings.providers");
  const errorText = useBookingErrorText();
  const router = useRouter();
  const id = useId();
  const [alert, setAlert] = useState<string | null>(null);
  const options = kind === "payment" ? MANUAL_METHODS : REFUND_METHODS;
  const form = useForm<ManualPaymentInput>({
    // Both schemas share the shape; the refund one allows VNPay as the method.
    resolver: zodResolver(kind === "payment" ? manualPaymentSchema : (refundSchema as unknown as typeof manualPaymentSchema), undefined, { raw: true }),
    defaultValues: { bookingId, amount: defaultAmount as number, method: options[0] as ManualPaymentInput["method"], note: "" },
  });

  async function onSubmit(values: ManualPaymentInput) {
    setAlert(null);
    const result = kind === "payment" ? await recordManualPaymentAction(values) : await recordRefundAction(values);
    if (!result.ok) {
      const key = applyServerErrors(result, (name, message) =>
        form.setError(name as keyof ManualPaymentInput, { type: "server", message }),
      );
      if (key) setAlert(errorText(key));
      return;
    }
    toast({ title: t(kind === "payment" ? "recorded" : "refunded", { reference: result.reference ?? "" }), variant: "success" });
    form.reset({ bookingId, amount: null as unknown as number, method: values.method, note: "" });
    router.refresh();
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="font-sans text-h4 font-semibold">
          {kind === "payment" ? t("manualTitle") : t("refundTitle")}
        </h3>
        <p className="text-small text-muted-foreground">
          {kind === "payment" ? t("manualHelp") : t("refundHelp", { amount: formatVnd(maxAmount ?? 0, "vi") })}
        </p>
        {alert && (
          <Alert variant="destructive" live="assertive">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("amount")}</FormLabel>
                <FormControl>
                  <MoneyInput
                    name={field.name}
                    ref={field.ref}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value)}
                    onBlur={field.onBlur}
                  />
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("method")}</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field}>
                    {options.map((method) => (
                      <option key={method} value={method}>
                        {methods(method)}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("noteLabel")}</FormLabel>
              <FormControl>
                <Textarea rows={2} maxLength={500} {...field} />
              </FormControl>
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("saving") : kind === "payment" ? t("record") : t("refundSubmit")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
