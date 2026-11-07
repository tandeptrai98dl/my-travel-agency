"use client";

import "@/lib/zod-config";

import { zodResolver } from "@hookform/resolvers/zod";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { type FieldPath, type FieldValues, useForm, type UseFormReturn } from "react-hook-form";

import { downloadFile } from "@/components/admin/operations/download-file";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { addCustomerNoteAction, exportCustomerDataAction, finishCustomerDeletionAction } from "@/modules/account/customers-admin.actions";
import {
  type CustomerActionResult,
  type CustomerNoteInput,
  customerNoteSchema,
  type FinishDeletionInput,
  finishDeletionSchema,
} from "@/modules/account/customers-admin.schemas";

/**
 * Actions on a customer's admin page (spec Phase 5 decision 16). Each form calls its Server
 * Action from React Hook Form's submit handler (no form `action`, so React never resets the
 * fields); the service, RLS and the database functions decide again what the role may do.
 */

function useErrorText() {
  const t = useTranslations("Admin.Operations.Customers.errors");
  return (key: string) => (t.has(key) ? t(key) : t("failed"));
}

function useResult<T extends FieldValues>(form: UseFormReturn<T>) {
  const errorText = useErrorText();
  const reasonsT = useTranslations("Admin.Operations.Customers.blockers");
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);
  async function handle(result: CustomerActionResult, success: string, reset: () => void) {
    if (!result.ok) {
      const fields = Object.entries(result.fields ?? {});
      for (const [name, message] of fields) form.setError(name as FieldPath<T>, { type: "server", message });
      if (fields.length > 0) setAlert(null);
      else if (result.error === "blocked" && result.reasons?.length) {
        setAlert(`${errorText("blocked")} ${result.reasons.map((reason) => (reasonsT.has(reason) ? reasonsT(reason) : reason)).join(", ")}.`);
      } else setAlert(errorText(result.error));
      return;
    }
    setAlert(null);
    toast({ title: success, variant: "success" });
    reset();
    router.refresh();
  }
  return { alert, handle, errorText };
}

function FormAlert({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Alert variant="destructive" live="assertive">
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

/** An internal note on the customer (sales roles and admin). */
export function CustomerNoteForm({ customerId }: { customerId: string }) {
  const t = useTranslations("Admin.Operations.Customers.Detail");
  const id = useId();
  const form = useForm<CustomerNoteInput>({
    resolver: zodResolver(customerNoteSchema, undefined, { raw: true }),
    defaultValues: { customerId, body: "" },
  });
  const { alert, handle, errorText } = useResult(form);

  async function onSubmit(values: CustomerNoteInput) {
    await handle(await addCustomerNoteAction(values), t("noteSaved"), () => form.reset({ customerId, body: "" }));
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="font-sans text-h4 font-semibold">
          {t("noteTitle")}
        </h3>
        <FormAlert text={alert} />
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("noteBody")}</FormLabel>
              <FormControl>
                <Textarea rows={3} maxLength={2000} {...field} />
              </FormControl>
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("saving") : t("noteSave")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/**
 * Finishes (or retries) a deletion request that had to wait, with a note (MFA-verified admin).
 * The server refuses while a blocker remains and names it.
 */
export function FinishDeletionForm({ customerId, retry }: { customerId: string; retry: boolean }) {
  const t = useTranslations("Admin.Operations.Customers.Deletion");
  const id = useId();
  const form = useForm<FinishDeletionInput>({
    resolver: zodResolver(finishDeletionSchema, undefined, { raw: true }),
    defaultValues: { customerId, note: "" },
  });
  const { alert, handle, errorText } = useResult(form);

  async function onSubmit(values: FinishDeletionInput) {
    await handle(await finishCustomerDeletionAction(values), t("done"), () => form.reset({ customerId, note: "" }));
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="font-sans text-h4 font-semibold">
          {retry ? t("retryTitle") : t("finishTitle")}
        </h3>
        <FormAlert text={alert} />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("note")}</FormLabel>
              <FormControl>
                <Textarea rows={2} maxLength={2000} {...field} />
              </FormControl>
              <FormDescription>{t("noteHelp")}</FormDescription>
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("running") : retry ? t("retry") : t("finish")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** Downloads the customer's personal data as JSON (MFA-verified admin); audit-logged first. */
export function ExportCustomerButton({ customerId }: { customerId: string }) {
  const t = useTranslations("Admin.Operations.Customers.Detail");
  const errorText = useErrorText();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const result = await exportCustomerDataAction({ customerId });
          if (!result.ok) {
            toast({ title: errorText(result.error), variant: "destructive" });
            return;
          }
          downloadFile(result.json, result.filename, "application/json;charset=utf-8");
          toast({ title: t("exported"), variant: "success" });
        })
      }
    >
      <Download strokeWidth={1.5} aria-hidden="true" />
      {t("export")}
    </Button>
  );
}
