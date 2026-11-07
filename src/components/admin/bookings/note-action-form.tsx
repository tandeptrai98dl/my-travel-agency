"use client";

import "@/lib/zod-config";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { formatVnd } from "@/lib/money";
import { cancelBookingAction, requestCancellationAction, resolveAttentionAction } from "@/modules/booking/booking-admin.actions";
import { type BookingNoteInput, bookingNoteSchema } from "@/modules/booking/booking-admin.schemas";

import { applyServerErrors } from "./fields";
import { useBookingErrorText } from "./use-booking-error-text";

type Kind = "resolve" | "request" | "cancel";

const ACTIONS = { resolve: resolveAttentionAction, request: requestCancellationAction, cancel: cancelBookingAction };

/**
 * One note and one action: clear the "needs attention" flag, ask for a cancellation, or cancel
 * (with an inline confirmation step, since it releases the seats and cannot be undone).
 */
export function NoteActionForm({ bookingId, code, kind }: { bookingId: string; code: string; kind: Kind }) {
  const t = useTranslations("Admin.BookingDetail");
  const errorText = useBookingErrorText();
  const router = useRouter();
  const id = useId();
  const confirmRef = useRef<HTMLDivElement>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const form = useForm<BookingNoteInput>({
    resolver: zodResolver(bookingNoteSchema, undefined, { raw: true }),
    defaultValues: { bookingId, note: "" },
  });
  const copy = {
    resolve: { title: t("resolve"), note: t("resolveNote"), help: null, submit: t("resolve") },
    request: { title: t("requestTitle"), note: t("noteLabel"), help: t("requestHelp"), submit: t("requestSubmit") },
    cancel: { title: t("cancelTitle"), note: t("cancelReason"), help: t("cancelHelp"), submit: t("cancelSubmit") },
  }[kind];

  async function run(values: BookingNoteInput) {
    setAlert(null);
    const result = await ACTIONS[kind](values);
    setConfirming(false);
    if (!result.ok) {
      const key = applyServerErrors(result, (name, message) =>
        form.setError(name as keyof BookingNoteInput, { type: "server", message }),
      );
      if (key) setAlert(errorText(key));
      return;
    }
    if (kind === "cancel") {
      toast({
        title: t("cancelled", { amount: formatVnd(result.refundAmount ?? 0, "vi"), percent: result.refundPercent ?? 0 }),
        variant: "success",
      });
    } else {
      toast({ title: kind === "resolve" ? t("resolved") : t("requested"), variant: "success" });
    }
    form.reset({ bookingId, note: "" });
    router.refresh();
  }

  async function onSubmit(values: BookingNoteInput) {
    if (kind !== "cancel") return run(values);
    setConfirming(true);
    requestAnimationFrame(() => confirmRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="font-sans text-h4 font-semibold">
          {copy.title}
        </h3>
        {alert && (
          <Alert variant="destructive" live="assertive">
            <AlertDescription>{alert}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{copy.note}</FormLabel>
              <FormControl>
                <Textarea rows={3} maxLength={500} {...field} />
              </FormControl>
              {copy.help && <FormDescription>{copy.help}</FormDescription>}
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />
        {confirming ? (
          <div ref={confirmRef} role="group" aria-labelledby={`${id}-confirm`} className="flex flex-col gap-3 rounded-lg border border-destructive p-4">
            <p id={`${id}-confirm`} className="font-medium">
              {t("cancelConfirmTitle", { code })}
            </p>
            <p className="text-small text-muted-foreground">{t("cancelConfirmBody")}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="destructive"
                disabled={form.formState.isSubmitting}
                aria-busy={form.formState.isSubmitting}
                onClick={() => run(form.getValues())}
              >
                {t("cancelConfirm")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                {t("keep")}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button
              type="submit"
              variant={kind === "cancel" ? "destructive" : "default"}
              disabled={form.formState.isSubmitting}
              aria-busy={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? t("saving") : copy.submit}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
