"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  type Control,
  type FieldPath,
  type FieldValues,
  type Path,
  type Resolver,
  useForm,
  type UseFormReturn,
} from "react-hook-form";

import type { MediaPickerLabels } from "@/components/admin/media/media-picker";
import { HeroField, type HeroSummary } from "@/components/admin/taxonomy/form-parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { saveSettingsAction } from "@/modules/settings/settings.actions";
import {
  PUBLIC_SETTINGS,
  type SettingsInput,
  settingsInputSchemas,
  type SettingsSection,
} from "@/modules/settings/settings.schemas";

type Destination = { key: string; label: string };

/** Zod messages and server error codes are keys in `Admin.Settings.errors`. */
function useErrorText() {
  const t = useTranslations("Admin.Settings.errors");
  return (key: string) => (t.has(key) ? t(key) : t("invalid"));
}

/** One section's form: validates in the browser with the same schema, saves through the action. */
function useSectionForm<S extends SettingsSection>(section: S, initial: SettingsInput[S]) {
  const t = useTranslations("Admin.Settings");
  const errorText = useErrorText();
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<SettingsInput[S]>({
    // `raw`: submit what the admin typed; the Server Action parses (and transforms) it once.
    // The section picks one schema; TypeScript cannot narrow the lookup by the generic key.
    resolver: zodResolver(settingsInputSchemas[section] as (typeof settingsInputSchemas)["company"], undefined, {
      raw: true,
    }) as unknown as Resolver<SettingsInput[S]>,
    defaultValues: initial as never,
  });

  async function onSubmit(value: SettingsInput[S]) {
    setAlert(null);
    const result = await saveSettingsAction({ section, value });
    if (!result.ok) {
      const fields: Record<string, string> = { ...("fields" in result ? result.fields : {}) };
      if ("field" in result && result.field) fields[result.field] = result.error;
      for (const [name, message] of Object.entries(fields)) {
        form.setError(name as Path<SettingsInput[S]>, { type: "server", message });
      }
      setAlert(Object.keys(fields).length > 0 ? t("fixErrors") : errorText(result.error));
      return;
    }
    toast({ title: t("saved"), variant: "success" });
    router.refresh();
  }

  return { form, alert, submit: form.handleSubmit(onSubmit, () => setAlert(t("fixErrors"))) };
}

function SectionCard<T extends FieldValues>({
  section,
  form,
  alert,
  submit,
  children,
}: {
  section: SettingsSection;
  form: UseFormReturn<T>;
  alert: string | null;
  submit: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("Admin.Settings");
  const id = `settings-${section}`;
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-lg border border-border bg-card p-5 md:p-8" data-testid={id}>
      <div className="mb-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id={`${id}-title`} className="font-serif text-h3 font-semibold lg:text-h3-lg">
            {t(`sections.${section}.title`)}
          </h2>
          <Badge variant={PUBLIC_SETTINGS[section] ? "outline" : "secondary"}>
            {PUBLIC_SETTINGS[section] ? t("public") : t("private")}
          </Badge>
        </div>
        <p className="max-w-prose text-small text-muted-foreground">{t(`sections.${section}.description`)}</p>
      </div>
      <Form {...form}>
        <form noValidate onSubmit={submit} className="flex flex-col gap-6" aria-labelledby={`${id}-title`}>
          {alert && (
            <Alert variant="destructive" live="assertive">
              <AlertDescription>{alert}</AlertDescription>
            </Alert>
          )}
          {children}
          <div className="flex justify-end border-t border-border pt-5">
            <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}

function TextField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  type = "text",
  maxLength,
  lang,
  inputMode,
  autoComplete = "off",
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
  type?: "text" | "email" | "url" | "tel";
  maxLength?: number;
  lang?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}) {
  const errorText = useErrorText();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              lang={lang}
              inputMode={inputMode}
              maxLength={maxLength}
              autoComplete={autoComplete}
              ref={field.ref}
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              value={(field.value as string | null | undefined) ?? ""}
            />
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage formatMessage={errorText} />
        </FormItem>
      )}
    />
  );
}

/** A VI and an EN input for one localized value. */
function LocalizedField<T extends FieldValues>({
  control,
  name,
  legend,
  maxLength,
}: {
  control: Control<T>;
  name: string;
  legend: string;
  maxLength: number;
}) {
  const t = useTranslations("Admin.Settings");
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-small font-medium">{legend}</legend>
      <div className="grid gap-4 md:grid-cols-2">
        {(["vi", "en"] as const).map((locale) => (
          <TextField
            key={locale}
            control={control}
            name={`${name}.${locale}` as FieldPath<T>}
            label={`${legend} (${t(locale)})`}
            lang={locale}
            maxLength={maxLength}
          />
        ))}
      </div>
    </fieldset>
  );
}

function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  min,
  max,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
  min: number;
  max: number;
}) {
  const errorText = useErrorText();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              inputMode="numeric"
              step="1"
              min={min}
              max={max}
              className="max-w-40"
              ref={field.ref}
              name={field.name}
              onBlur={field.onBlur}
              onChange={(event) => field.onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))}
              value={Number.isNaN(field.value) ? "" : (field.value as number)}
            />
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage formatMessage={errorText} />
        </FormItem>
      )}
    />
  );
}

function CompanyForm({ initial }: { initial: SettingsInput["company"] }) {
  const t = useTranslations("Admin.Settings.fields");
  const { form, alert, submit } = useSectionForm("company", initial);
  const c = form.control;
  return (
    <SectionCard section="company" form={form} alert={alert} submit={submit}>
      <div className="grid gap-6 md:grid-cols-2">
        <TextField control={c} name="name" label={t("name")} maxLength={120} autoComplete="organization" />
        <TextField control={c} name="legal_name" label={t("legal_name")} maxLength={200} />
        <TextField control={c} name="tax_code" label={t("tax_code")} hint={t("tax_codeHint")} maxLength={20} inputMode="numeric" />
        <TextField control={c} name="tour_operator_licence" label={t("tour_operator_licence")} maxLength={120} />
      </div>
      <TextField control={c} name="ecommerce_notification_url" label={t("ecommerce_notification_url")} type="url" maxLength={500} />
      <LocalizedField control={c} name="address" legend={t("address")} maxLength={300} />
    </SectionCard>
  );
}

function ContactForm({ initial }: { initial: SettingsInput["contact"] }) {
  const t = useTranslations("Admin.Settings.fields");
  const { form, alert, submit } = useSectionForm("contact", initial);
  const c = form.control;
  return (
    <SectionCard section="contact" form={form} alert={alert} submit={submit}>
      <div className="grid gap-6 md:grid-cols-2">
        <TextField control={c} name="phone" label={t("phone")} type="tel" maxLength={30} />
        <TextField control={c} name="email" label={t("email")} type="email" maxLength={200} />
        <TextField control={c} name="zalo" label={t("zalo")} type="tel" maxLength={30} />
        <TextField control={c} name="whatsapp" label={t("whatsapp")} type="tel" maxLength={30} />
      </div>
      <LocalizedField control={c} name="office_hours" legend={t("office_hours")} maxLength={120} />
    </SectionCard>
  );
}

function SocialForm({ initial }: { initial: SettingsInput["social"] }) {
  const t = useTranslations("Admin.Settings.fields");
  const { form, alert, submit } = useSectionForm("social", initial);
  return (
    <SectionCard section="social" form={form} alert={alert} submit={submit}>
      <div className="grid gap-6 md:grid-cols-2">
        {(["facebook", "instagram", "youtube", "tiktok"] as const).map((name) => (
          <TextField key={name} control={form.control} name={name} label={t(name)} type="url" maxLength={500} />
        ))}
      </div>
    </SectionCard>
  );
}

function BankAccountForm({ initial }: { initial: SettingsInput["bank_account"] }) {
  const t = useTranslations("Admin.Settings.fields");
  const { form, alert, submit } = useSectionForm("bank_account", initial);
  const c = form.control;
  return (
    <SectionCard section="bank_account" form={form} alert={alert} submit={submit}>
      <div className="grid gap-6 md:grid-cols-2">
        <TextField control={c} name="bank_name" label={t("bank_name")} maxLength={120} />
        <TextField control={c} name="bank_bin" label={t("bank_bin")} hint={t("bank_binHint")} maxLength={6} inputMode="numeric" />
        <TextField control={c} name="account_number" label={t("account_number")} maxLength={30} />
        <TextField control={c} name="account_holder" label={t("account_holder")} hint={t("account_holderHint")} maxLength={120} />
        <TextField control={c} name="branch" label={t("branch")} maxLength={120} />
      </div>
    </SectionCard>
  );
}

/** Reminder days typed as "7, 2"; the schema sorts them and drops repeats on save. */
function RemindersField({ control }: { control: Control<SettingsInput["booking_rules"]> }) {
  const t = useTranslations("Admin.Settings.fields");
  const errorText = useErrorText();
  return (
    <FormField
      control={control}
      name="balance_reminder_days_before_due"
      render={({ field, fieldState }) => (
        <RemindersInput
          label={t("reminders")}
          hint={t("remindersHint")}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          name={field.name}
          inputRef={field.ref}
          // The array's own error (count) or the first bad day.
          error={
            fieldState.error?.message ??
            (Array.isArray(fieldState.error) ? fieldState.error.find((item) => item?.message)?.message : undefined)
          }
          errorText={errorText}
        />
      )}
    />
  );
}

function RemindersInput({
  label,
  hint,
  value,
  onChange,
  onBlur,
  name,
  inputRef,
  error,
  errorText,
}: {
  label: string;
  hint: string;
  value: number[];
  onChange: (value: number[]) => void;
  onBlur: () => void;
  name: string;
  inputRef: React.Ref<HTMLInputElement>;
  error?: string;
  errorText: (key: string) => string;
}) {
  const id = useId();
  const [text, setText] = useState(() => value.join(", "));
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-small font-medium">
        {label}
      </label>
      <Input
        id={id}
        ref={inputRef}
        name={name}
        inputMode="numeric"
        className="max-w-60"
        aria-describedby={`${id}-hint ${id}-error`}
        aria-invalid={error ? true : undefined}
        value={text}
        onBlur={onBlur}
        onChange={(event) => {
          setText(event.target.value);
          const days = event.target.value
            .split(/[,;\s]+/)
            .filter(Boolean)
            .map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
          onChange(days);
        }}
      />
      <p id={`${id}-hint`} className="text-small text-muted-foreground">
        {hint}
      </p>
      <p id={`${id}-error`} aria-live="polite" className="text-small font-medium text-destructive empty:hidden">
        {error ? errorText(error) : null}
      </p>
    </div>
  );
}

function BookingRulesForm({ initial }: { initial: SettingsInput["booking_rules"] }) {
  const t = useTranslations("Admin.Settings.fields");
  const { form, alert, submit } = useSectionForm("booking_rules", initial);
  const c = form.control;
  return (
    <SectionCard section="booking_rules" form={form} alert={alert} submit={submit}>
      <div className="grid gap-6 md:grid-cols-2">
        <NumberField control={c} name="hold_minutes.vnpay" label={t("holdVnpay")} hint={t("holdVnpayHint")} min={10} max={60} />
        <NumberField
          control={c}
          name="hold_minutes.bank_transfer"
          label={t("holdBank")}
          hint={t("holdBankHint")}
          min={30}
          max={1440}
        />
        <NumberField
          control={c}
          name="booking_lookup_link_minutes"
          label={t("lookupMinutes")}
          hint={t("lookupMinutesHint")}
          min={10}
          max={120}
        />
        <NumberField control={c} name="booking_cutoff_days" label={t("cutoffDays")} hint={t("cutoffDaysHint")} min={0} max={60} />
      </div>
      <RemindersField control={c} />
    </SectionCard>
  );
}

function HomepageForm({
  initial,
  heroImage,
  destinations,
  pickerLabels,
}: {
  initial: SettingsInput["homepage"];
  heroImage: HeroSummary;
  destinations: Destination[];
  pickerLabels: MediaPickerLabels;
}) {
  const t = useTranslations("Admin.Settings.fields");
  const errorText = useErrorText();
  const { form, alert, submit } = useSectionForm("homepage", initial);
  const c = form.control;
  return (
    <SectionCard section="homepage" form={form} alert={alert} submit={submit}>
      <LocalizedField control={c} name="hero.eyebrow" legend={t("heroEyebrow")} maxLength={80} />
      <LocalizedField control={c} name="hero.title" legend={t("heroTitle")} maxLength={160} />
      <FormField
        control={c}
        name="hero.media_id"
        render={({ field, fieldState }) => (
          <HeroField
            id="settings-homepage-hero"
            legend={t("heroImage")}
            value={field.value ?? null}
            onChange={field.onChange}
            initial={heroImage}
            pickerLabels={pickerLabels}
            error={fieldState.error?.message ? errorText(fieldState.error.message) : undefined}
          />
        )}
      />
      <FormField
        control={c}
        name="featured_destination_keys"
        render={({ field, fieldState }) => (
          <fieldset className="flex flex-col gap-3" aria-describedby="settings-featured-hint settings-featured-error">
            <legend className="text-small font-medium">{t("featured")}</legend>
            <p id="settings-featured-hint" className="text-small text-muted-foreground">
              {t("featuredHint")}
            </p>
            {destinations.length === 0 ? (
              <p className="text-small text-muted-foreground">{t("noDestinations")}</p>
            ) : (
              <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {destinations.map((destination) => {
                  const checked = field.value.includes(destination.key);
                  const inputId = `settings-featured-${destination.key}`;
                  return (
                    <li key={destination.key} className="flex items-center gap-3">
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        onCheckedChange={(next) =>
                          field.onChange(
                            next === true
                              ? [...field.value, destination.key]
                              : field.value.filter((key) => key !== destination.key),
                          )
                        }
                      />
                      <label htmlFor={inputId} className="text-small">
                        {destination.label}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p id="settings-featured-error" aria-live="polite" className="text-small font-medium text-destructive empty:hidden">
              {fieldState.error?.message ? errorText(fieldState.error.message) : null}
            </p>
          </fieldset>
        )}
      />
      <NumberField
        control={c}
        name="journal_teaser_count"
        label={t("journalCount")}
        hint={t("journalCountHint")}
        min={0}
        max={6}
      />
    </SectionCard>
  );
}

/** `/admin/settings` (spec Phase 2 step 21): one form per settings key, each saved on its own. */
export function SettingsForms({
  values,
  heroImage,
  destinations,
  pickerLabels,
}: {
  values: SettingsInput;
  heroImage: HeroSummary;
  destinations: Destination[];
  pickerLabels: MediaPickerLabels;
}) {
  return (
    <div className="flex flex-col gap-8">
      <CompanyForm initial={values.company} />
      <ContactForm initial={values.contact} />
      <SocialForm initial={values.social} />
      <BankAccountForm initial={values.bank_account} />
      <BookingRulesForm initial={values.booking_rules} />
      <HomepageForm initial={values.homepage} heroImage={heroImage} destinations={destinations} pickerLabels={pickerLabels} />
    </div>
  );
}
