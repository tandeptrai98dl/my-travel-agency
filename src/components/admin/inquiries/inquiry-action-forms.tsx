"use client";

import "@/lib/zod-config";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { type FieldPath, type FieldValues, useForm, type UseFormReturn } from "react-hook-form";

import { selectClass } from "@/components/admin/bookings/fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { addInquiryNoteAction, assignInquiryAction, updateInquiryStatusAction } from "@/modules/inquiry/inquiry-admin.actions";
import {
  type InquiryActionResult,
  type InquiryAssignInput,
  inquiryAssignSchema,
  type InquiryNoteInput,
  inquiryNoteSchema,
  type InquiryStatus,
  type InquiryStatusInput,
  inquiryStatusSchema,
  SETTABLE_STATUSES,
} from "@/modules/inquiry/inquiry-admin.schemas";

/**
 * The inbox actions on an inquiry's page (spec Phase 5 decision 9). Each form calls its Server
 * Action from React Hook Form's submit handler (no form `action`, so React never resets the
 * fields); the database functions decide again what the role may do.
 */

function useErrorText() {
  const t = useTranslations("Admin.Inquiries.errors");
  return (key: string) => (t.has(key) ? t(key) : t("failed"));
}

/** Puts server field errors back on the form; returns the alert text when there are none. */
function useResult<T extends FieldValues>(form: UseFormReturn<T>) {
  const errorText = useErrorText();
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);
  async function handle(result: InquiryActionResult, success: string, reset: () => void) {
    if (!result.ok) {
      const fields = Object.entries(result.fields ?? {});
      for (const [name, message] of fields) form.setError(name as FieldPath<T>, { type: "server", message });
      setAlert(fields.length === 0 ? errorText(result.error) : null);
      return;
    }
    setAlert(null);
    toast({ title: success, variant: "success" });
    reset();
    router.refresh();
  }
  return { alert, setAlert, handle, errorText };
}

function FormAlert({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Alert variant="destructive" live="assertive">
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

type Assignee = { value: string; label: string };

/** Managers and admins pick an owner (or nobody); sales take an unassigned inquiry for themselves. */
export function InquiryAssignForm({
  inquiryId,
  ownerId,
  ownerName,
  selfId,
  assignees,
  manager,
}: {
  inquiryId: string;
  ownerId: string | null;
  ownerName: string | null;
  selfId: string;
  assignees: Assignee[];
  manager: boolean;
}) {
  const t = useTranslations("Admin.Inquiries.Detail");
  const id = useId();
  const form = useForm<InquiryAssignInput>({
    resolver: zodResolver(inquiryAssignSchema, undefined, { raw: true }),
    defaultValues: { inquiryId, assignee: manager ? (ownerId ?? "") : selfId },
  });
  const { alert, handle, errorText } = useResult(form);

  async function onSubmit(values: InquiryAssignInput) {
    const result = await assignInquiryAction(values);
    await handle(result, manager ? t("assigned") : t("taken"), () => form.reset(values));
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="font-sans text-h4 font-semibold">
          {t("assignTitle")}
        </h3>
        <FormAlert text={alert} />
        {manager ? (
          <FormField
            control={form.control}
            name="assignee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("assignee")}</FormLabel>
                <FormControl>
                  <select className={selectClass} {...field}>
                    <option value="">{t("nobody")}</option>
                    {assignees.map((person) => (
                      <option key={person.value} value={person.value}>
                        {person.label}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
        ) : (
          <p className="text-small text-muted-foreground">{ownerName ? t("ownedBy", { name: ownerName }) : null}</p>
        )}
        <div>
          <Button type="submit" variant={manager ? "outline" : "default"} disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("saving") : manager ? t("assignSave") : t("take")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** A status other than "new" (and other than the current one), with an optional note. */
export function InquiryStatusForm({ inquiryId, current }: { inquiryId: string; current: InquiryStatus }) {
  const t = useTranslations("Admin.Inquiries");
  const id = useId();
  const form = useForm<InquiryStatusInput>({
    resolver: zodResolver(inquiryStatusSchema, undefined, { raw: true }),
    defaultValues: { inquiryId, status: "" as never, note: "" },
  });
  const { alert, handle, errorText } = useResult(form);

  async function onSubmit(values: InquiryStatusInput) {
    const result = await updateInquiryStatusAction(values);
    await handle(result, t("Detail.statusSaved"), () => form.reset({ inquiryId, status: "" as never, note: "" }));
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="font-sans text-h4 font-semibold">
          {t("Detail.statusTitle")}
        </h3>
        <FormAlert text={alert} />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("Detail.newStatus")}</FormLabel>
              <FormControl>
                <select className={selectClass} {...field}>
                  <option value="">{t("Detail.chooseStatus")}</option>
                  {SETTABLE_STATUSES.filter((status) => status !== current).map((status) => (
                    <option key={status} value={status}>
                      {t(`statuses.${status}`)}
                    </option>
                  ))}
                </select>
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
              <FormLabel>{t("Detail.statusNote")}</FormLabel>
              <FormControl>
                <Textarea rows={2} maxLength={2000} {...field} />
              </FormControl>
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" variant="outline" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("Detail.saving") : t("Detail.statusSave")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** An internal note; "I have contacted the customer" records the first response. */
export function InquiryNoteForm({ inquiryId }: { inquiryId: string }) {
  const t = useTranslations("Admin.Inquiries.Detail");
  const id = useId();
  const form = useForm<InquiryNoteInput>({
    resolver: zodResolver(inquiryNoteSchema, undefined, { raw: true }),
    defaultValues: { inquiryId, body: "", contacted: false },
  });
  const { alert, handle, errorText } = useResult(form);

  async function onSubmit(values: InquiryNoteInput) {
    const result = await addInquiryNoteAction(values);
    await handle(result, t("noteSaved"), () => form.reset({ inquiryId, body: "", contacted: false }));
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
        <FormField
          control={form.control}
          name="contacted"
          render={({ field }) => (
            <FormItem className="flex-row items-start gap-3">
              <FormControl>
                <Checkbox checked={field.value === true} onCheckedChange={(next) => field.onChange(next === true)} />
              </FormControl>
              <div className="flex flex-col gap-1">
                <FormLabel>{t("contacted")}</FormLabel>
                <FormDescription>{t("contactedHelp")}</FormDescription>
              </div>
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
