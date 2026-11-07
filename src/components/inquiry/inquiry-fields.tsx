"use client";

import type { ReactNode } from "react";

import { cx } from "@/lib/cx";
import type { InquiryField, InquiryState } from "@/modules/inquiry/tailor-made.schemas";

/** Labels shared by the tailor-made wizard and the tour inquiry form (from `public-inquiry.json`). */
export type InquiryContactLabels = {
  name: string;
  email: string;
  phone: string;
  preferred: string;
  channels: Record<"email" | "phone" | "zalo" | "whatsapp", string>;
  adults: string;
  children: string;
  month: string;
  monthHint: string;
  message: string;
  consent: string;
  privacyLink: string;
  newTab: string;
  sending: string;
  unavailable: string;
  errors: Record<string, string>;
};

export const fieldClass =
  "w-full min-w-0 rounded-md border border-input bg-card px-3.5 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive";
export const choiceClass = "h-5 w-5 shrink-0 accent-[hsl(var(--primary))]";

type FieldProps = {
  id: string;
  label: string;
  field?: InquiryField;
  state: InquiryState;
  labels: Pick<InquiryContactLabels, "errors">;
  hint?: string;
  children: (aria: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
  className?: string;
};

/** A labelled control with its hint and the server's error, linked for screen readers. */
export function Field({ id, label, field, state, labels, hint, children, className }: FieldProps) {
  const error = field ? state.errors?.[field] : undefined;
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-small font-medium">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-small text-muted-foreground">
          {hint}
        </p>
      )}
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": described })}
      {error && (
        <p id={`${id}-error`} className="text-small text-destructive">
          {labels.errors[error] ?? labels.errors.invalid}
        </p>
      )}
    </div>
  );
}

/** Contact details: name, email, phone and the preferred channel. */
export function ContactFields({ idPrefix, state, labels }: { idPrefix: string; state: InquiryState; labels: InquiryContactLabels }) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${idPrefix}-name`} label={labels.name} field="name" state={state} labels={labels}>
          {(aria) => <input {...aria} name="name" required autoComplete="name" maxLength={120} className={cx(fieldClass, "h-12")} />}
        </Field>
        <Field id={`${idPrefix}-email`} label={labels.email} field="email" state={state} labels={labels}>
          {(aria) => <input {...aria} name="email" type="email" required autoComplete="email" inputMode="email" maxLength={254} className={cx(fieldClass, "h-12")} />}
        </Field>
      </div>
      <Field id={`${idPrefix}-phone`} label={labels.phone} field="phone" state={state} labels={labels}>
        {(aria) => <input {...aria} name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} className={cx(fieldClass, "h-12 sm:max-w-xs")} />}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-small font-medium">{labels.preferred}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(Object.keys(labels.channels) as (keyof typeof labels.channels)[]).map((channel) => (
            <label key={channel} className="inline-flex min-h-11 items-center gap-2 text-body">
              <input type="radio" name="preferredContact" value={channel} defaultChecked={channel === "email"} className={choiceClass} />
              {labels.channels[channel]}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

/** The privacy consent (required), linking the published policy. */
export function ConsentField({ id, state, labels, privacyHref }: { id: string; state: InquiryState; labels: InquiryContactLabels; privacyHref: string | null }) {
  const error = state.errors?.consent;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-start gap-3 text-small">
        <input id={id} name="consent" type="checkbox" required aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={cx(choiceClass, "mt-0.5")} />
        <span>
          {labels.consent}{" "}
          {privacyHref ? (
            <a href={privacyHref} className="underline decoration-gold underline-offset-4" target="_blank" rel="noopener">
              {labels.privacyLink}
              <span className="sr-only"> {labels.newTab}</span>
            </a>
          ) : (
            labels.privacyLink
          )}
          .
        </span>
      </label>
      {error && (
        <p id={`${id}-error`} className="text-small text-destructive">
          {labels.errors[error] ?? labels.errors.invalid}
        </p>
      )}
    </div>
  );
}

/** The honeypot: hidden from people and assistive technology, filled only by bots. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

/** The next twelve months as `YYYY-MM`, in the visitor's calendar (built in the browser). */
export function upcomingMonths(count = 18, from = new Date()): string[] {
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(from.getFullYear(), from.getMonth() + i, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/** "Tháng 3, 2027" / "March 2027". */
export function monthLabel(month: string, locale: "vi" | "en"): string {
  const [year, value] = month.split("-").map(Number);
  return new Date(year, value - 1, 1).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-GB", { month: "long", year: "numeric" });
}
