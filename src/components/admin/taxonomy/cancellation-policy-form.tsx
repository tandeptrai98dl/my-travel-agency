"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { saveCancellationPolicyAction } from "@/modules/catalog/taxonomy/taxonomy.actions";
import {
  type CancellationPolicyInput,
  cancellationPolicySchema,
} from "@/modules/catalog/taxonomy/taxonomy.schemas";

import { useActionErrors, useErrorText } from "./form-parts";

const MAX_RULES = 10;

/**
 * Create or edit a cancellation policy (spec Phase 2 step 10, ADR-016): refund tiers from the
 * earliest cancellation to the day of departure, bilingual summaries, one default.
 */
export function CancellationPolicyForm({
  initial,
  deleteAction,
}: {
  initial: CancellationPolicyInput;
  deleteAction?: React.ReactNode;
}) {
  const t = useTranslations("Admin.Taxonomy");
  const router = useRouter();
  const errorText = useErrorText();
  const applyErrors = useActionErrors();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<CancellationPolicyInput>({
    // `raw`: submit what the editor typed; the Server Action parses (and transforms) it once.
    resolver: zodResolver(cancellationPolicySchema, undefined, { raw: true }),
    defaultValues: initial,
  });
  const rules = useFieldArray({ control: form.control, name: "rules" });
  const rulesError = form.formState.errors.rules?.root?.message ?? form.formState.errors.rules?.message;

  async function onSubmit(values: CancellationPolicyInput) {
    setAlert(null);
    const result = await saveCancellationPolicyAction(values);
    if (!result.ok) {
      setAlert(applyErrors(form, result));
      return;
    }
    toast(
      result.warning
        ? { title: errorText(result.warning), variant: "destructive" }
        : { title: t("saved"), variant: "success" },
    );
    if (!initial.id && result.id) router.push(`/admin/cancellation-policies/${result.id}`);
    else router.refresh();
  }

  const numberProps = (onChange: (value: number) => void) => ({
    type: "number" as const,
    inputMode: "numeric" as const,
    step: "1",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange(event.target.value === "" ? Number.NaN : Number(event.target.value)),
  });

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
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("policyName")}</FormLabel>
              <FormControl>
                <Input maxLength={120} {...field} />
              </FormControl>
              <FormMessage formatMessage={errorText} />
            </FormItem>
          )}
        />

        <fieldset className="flex flex-col gap-4" aria-describedby="policy-rules-hint policy-rules-error">
          <legend className="text-small font-medium">{t("rules")}</legend>
          <p id="policy-rules-hint" className="text-small text-muted-foreground">
            {t("rulesHint")}
          </p>
          <ol className="flex flex-col gap-3">
            {rules.fields.map((rule, index) => (
              <li key={rule.id}>
                <fieldset className="grid grid-cols-2 items-start gap-3 rounded-lg sm:grid-cols-[1fr_1fr_auto] border border-border bg-card p-4">
                  <legend className="sr-only">{t("ruleRow", { index: index + 1 })}</legend>
                  <FormField
                    control={form.control}
                    name={`rules.${index}.minDaysBefore`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="min-h-10 sm:min-h-0">{t("minDaysBefore")}</FormLabel>
                        <FormControl>
                          <Input
                            {...numberProps(field.onChange)}
                            min={0}
                            max={365}
                            ref={field.ref}
                            name={field.name}
                            onBlur={field.onBlur}
                            value={Number.isNaN(field.value) ? "" : field.value}
                          />
                        </FormControl>
                        <FormMessage formatMessage={errorText} />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`rules.${index}.refundPercent`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="min-h-10 sm:min-h-0">{t("refundPercent")}</FormLabel>
                        <FormControl>
                          <Input
                            {...numberProps(field.onChange)}
                            min={0}
                            max={100}
                            ref={field.ref}
                            name={field.name}
                            onBlur={field.onBlur}
                            value={Number.isNaN(field.value) ? "" : field.value}
                          />
                        </FormControl>
                        <FormMessage formatMessage={errorText} />
                      </FormItem>
                    )}
                  />
                  <IconButton
                    label={t("removeRule", { index: index + 1 })}
                    variant="ghost"
                    className="col-span-2 justify-self-end sm:col-span-1 sm:mt-7"
                    disabled={rules.fields.length === 1}
                    onClick={() => rules.remove(index)}
                    icon={<Trash2 strokeWidth={1.5} />}
                  />
                </fieldset>
              </li>
            ))}
          </ol>
          <p id="policy-rules-error" aria-live="polite" className="text-small font-medium text-destructive empty:-mt-4">
            {rulesError ? errorText(rulesError) : null}
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={rules.fields.length >= MAX_RULES}
              onClick={() => rules.append({ minDaysBefore: 0, refundPercent: 0 })}
            >
              <Plus strokeWidth={1.5} aria-hidden="true" />
              {t("addRule")}
            </Button>
          </div>
        </fieldset>

        {(["vi", "en"] as const).map((locale) => (
          <FormField
            key={locale}
            control={form.control}
            name={`summary.${locale}`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{locale === "vi" ? t("summaryVi") : t("summaryEn")}</FormLabel>
                <FormControl>
                  <Textarea lang={locale} rows={3} maxLength={600} {...field} />
                </FormControl>
                <FormMessage formatMessage={errorText} />
              </FormItem>
            )}
          />
        ))}

        <FormField
          control={form.control}
          name="isDefault"
          render={({ field }) => (
            <FormItem className="flex flex-row flex-wrap items-center gap-3">
              <FormControl>
                <Checkbox
                  ref={field.ref}
                  checked={field.value}
                  // The current default is replaced by making another policy the default.
                  disabled={initial.isDefault}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              </FormControl>
              <FormLabel>{t("isDefault")}</FormLabel>
              {initial.isDefault && <FormDescription className="basis-full">{t("defaultHint")}</FormDescription>}
              <FormMessage formatMessage={errorText} className="basis-full" />
            </FormItem>
          )}
        />

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
