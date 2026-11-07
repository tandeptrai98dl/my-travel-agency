"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { useSubmitWithoutReset } from "@/components/forms/use-submit-without-reset";
import { useTurnstile } from "@/components/forms/use-turnstile";
import { buttonVariants } from "@/components/ui/button-variants";
import { cx } from "@/lib/cx";
import type { sendInquiry } from "@/modules/inquiry/tailor-made.actions";
import type { InquiryField, InquiryState } from "@/modules/inquiry/tailor-made.schemas";

import type { InquirySuccessLabels } from "./inquiry-success";
import { LazyInquirySuccess, preloadInquirySuccess } from "./inquiry-success-lazy";
import { choiceClass, ConsentField, ContactFields, Field, fieldClass, Honeypot, type InquiryContactLabels, monthLabel, upcomingMonths } from "./inquiry-fields";

export type WizardDestination = { key: string; name: string; children: { key: string; name: string }[] };

export type TailorMadeLabels = InquiryContactLabels & {
  steps: [string, string, string, string, string];
  stepOf: string;
  stepTitles: [string, string, string, string, string];
  destinationsHint: string;
  destinationsOther: string;
  flexible: string;
  monthUndecided: string;
  duration: string;
  durationHint: string;
  budget: string;
  budgets: Record<string, string>;
  style: string;
  styleNone: string;
  country: string;
  company: string;
  companyHint: string;
  messageHint: string;
  next: string;
  back: string;
  submit: string;
  draftRestored: string;
  success: InquirySuccessLabels;
};

type Props = {
  locale: "vi" | "en";
  siteKey: string | null;
  privacyHref: string | null;
  destinations: WizardDestination[];
  styles: { key: string; name: string }[];
  labels: TailorMadeLabels;
  /** The Server Action, passed down from the page (as the tour form: no action client in this page's JS). */
  sendInquiry: typeof sendInquiry;
};

/** The step that holds each field, to reopen it when the server reports an error there. */
const FIELD_STEP: Partial<Record<InquiryField, number>> = { destinations: 0, travelMonth: 1, durationDays: 1, adults: 2, children: 2, budget: 3 };
const BUDGET_KEYS = ["under_30m", "30_60m", "60_100m", "100_200m", "over_200m", "not_sure"];

/** The draft code, loaded on demand (see tailor-made-draft.ts). */
const loadDraft = () => import("./tailor-made-draft");

/**
 * The tailor-made wizard (Phase 5 PR 5W, DESIGN_SYSTEM "Consultation"): destination → timing →
 * travellers → budget and style → contact, one form whose steps are shown one at a time once
 * JavaScript runs (all at once without it). Each step checks its own fields before moving on; a
 * draft is kept in this browser and cleared after sending. Turnstile loads on the first
 * interaction; the server validates everything again.
 */
export function TailorMadeWizard({ locale, siteKey, privacyHref, destinations, styles, labels, sendInquiry }: Props) {
  const [state, action, pending] = useActionState<InquiryState, FormData>(sendInquiry, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const headingRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const turnstile = useTurnstile({ siteKey, locale, action: "inquiry", formRef });
  const { reset } = turnstile;
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [months, setMonths] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const [utm, setUtm] = useState<[string, string][]>([]);
  const disabled = !siteKey;
  const done = state.status === "sent";
  const last = labels.steps.length - 1;

  useEffect(() => {
    setReady(true);
    setMonths(upcomingMonths());
  }, []);

  useEffect(() => {
    if (pending) preloadInquirySuccess();
  }, [pending]);

  // The draft goes back in once the month options exist (a saved month needs its option); campaign
  // tags from the URL come with the same on-demand module.
  useEffect(() => {
    if (!months.length || !formRef.current) return;
    let cancelled = false;
    void loadDraft().then(({ readDraft, restoreDraft, campaignTags }) => {
      if (cancelled) return;
      setUtm(campaignTags());
      const draft = readDraft();
      if (cancelled || !draft?.length || !formRef.current) return;
      restoreDraft(formRef.current, draft);
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [months]);

  useEffect(() => {
    if (state.status === "idle") return;
    reset();
    if (state.status === "sent") {
      void loadDraft().then(({ clearDraft }) => clearDraft());
      return;
    }
    const first = (Object.keys(state.errors ?? {}) as InquiryField[])[0];
    if (first) {
      const target = FIELD_STEP[first] ?? last;
      setStep(target);
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[aria-invalid="true"], [name="${first}"]`)?.focus());
    } else statusRef.current?.focus();
  }, [state, reset, last]);

  const go = (target: number) => {
    setStep(target);
    requestAnimationFrame(() => headingRefs.current[target]?.focus());
  };

  const next = () => {
    const panel = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const invalid = panel ? Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")).find((control) => !control.checkValidity()) : undefined;
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return;
    }
    go(step + 1);
  };

  // Enter on an earlier step moves on instead of sending; the last step waits for Turnstile.
  const onSubmit = useSubmitWithoutReset(action, (event) => {
    if (step !== last) {
      event.preventDefault();
      next();
      return;
    }
    turnstile.onSubmit(event);
  });

  if (done) return <LazyInquirySuccess code={state.code ?? null} labels={labels.success} locale={locale} />;

  const statusText = state.status !== "idle" ? (labels.errors[state.status] ?? labels.errors.failed) : disabled ? labels.unavailable : "";
  const panelClass = (index: number) => cx("flex flex-col gap-6", ready && index !== step && "hidden");

  return (
    <form
      ref={formRef}
      action={action}
      noValidate
      onFocus={turnstile.start}
      onPointerDown={turnstile.start}
      onSubmit={onSubmit}
      onChange={(event) => {
        const form = event.currentTarget;
        void loadDraft().then(({ writeDraft }) => writeDraft(form));
      }}
      className="flex flex-col gap-8"
    >
      <input type="hidden" name="source" value="tailor_made" />
      <input type="hidden" name="locale" value={locale} />
      {utm.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Honeypot />

      {ready && (
        <ol className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-4 text-small" aria-label={labels.stepOf.replace("{step}", String(step + 1)).replace("{count}", String(last + 1))}>
          {labels.steps.map((name, index) => (
            <li key={name} aria-current={index === step ? "step" : undefined} className={cx("flex items-center gap-2", index === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
              <span aria-hidden="true" className={cx("flex h-6 w-6 items-center justify-center rounded-full border text-eyebrow", index <= step ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                {index + 1}
              </span>
              {name}
            </li>
          ))}
        </ol>
      )}
      {restored && ready && <p className="text-small text-muted-foreground">{labels.draftRestored}</p>}

      <fieldset disabled={disabled} className="flex flex-col gap-10 disabled:opacity-80">
        <section data-step={0} className={panelClass(0)} aria-labelledby="tm-step-0">
          <StepHeading index={0} labels={labels} refs={headingRefs} />
          <fieldset className="flex flex-col gap-3" aria-describedby="tm-dest-hint">
            <legend className="sr-only">{labels.stepTitles[0]}</legend>
            <p id="tm-dest-hint" className="text-small text-muted-foreground">{labels.destinationsHint}</p>
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {destinations.map((country) => (
                <div key={country.key} className="flex flex-col">
                  <label className="inline-flex min-h-11 items-center gap-3 text-body font-medium">
                    <input type="checkbox" name="dest" value={country.key} className={choiceClass} />
                    {country.name}
                  </label>
                  {country.children.map((region) => (
                    <label key={region.key} className="ml-8 inline-flex min-h-11 items-center gap-3 text-body">
                      <input type="checkbox" name="dest" value={region.key} className={choiceClass} />
                      {region.name}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>
          <Field id="tm-other" label={labels.destinationsOther} state={state} labels={labels}>
            {(aria) => <input {...aria} name="destinationsOther" maxLength={300} className={cx(fieldClass, "h-12")} />}
          </Field>
        </section>

        <section data-step={1} className={panelClass(1)} aria-labelledby="tm-step-1">
          <StepHeading index={1} labels={labels} refs={headingRefs} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="tm-month" label={labels.month} field="travelMonth" state={state} labels={labels} hint={labels.monthHint}>
              {(aria) => (
                <select {...aria} name="travelMonth" defaultValue="" className={cx(fieldClass, "h-12")}>
                  <option value="">{labels.monthUndecided}</option>
                  {months.map((month) => (
                    <option key={month} value={month}>
                      {monthLabel(month, locale)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field id="tm-duration" label={labels.duration} field="durationDays" state={state} labels={labels} hint={labels.durationHint}>
              {(aria) => <input {...aria} name="durationDays" type="number" inputMode="numeric" min={1} max={60} className={cx(fieldClass, "h-12 sm:max-w-[10rem]")} />}
            </Field>
          </div>
          <label className="inline-flex min-h-11 items-center gap-3 text-body">
            <input type="checkbox" name="flexibleDates" defaultChecked className={choiceClass} />
            {labels.flexible}
          </label>
        </section>

        <section data-step={2} className={panelClass(2)} aria-labelledby="tm-step-2">
          <StepHeading index={2} labels={labels} refs={headingRefs} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="tm-adults" label={labels.adults} field="adults" state={state} labels={labels}>
              {(aria) => <input {...aria} name="adults" type="number" inputMode="numeric" required min={1} max={50} defaultValue={2} className={cx(fieldClass, "h-12 sm:max-w-[10rem]")} />}
            </Field>
            <Field id="tm-children" label={labels.children} field="children" state={state} labels={labels}>
              {(aria) => <input {...aria} name="children" type="number" inputMode="numeric" min={0} max={50} defaultValue={0} className={cx(fieldClass, "h-12 sm:max-w-[10rem]")} />}
            </Field>
          </div>
        </section>

        <section data-step={3} className={panelClass(3)} aria-labelledby="tm-step-3">
          <StepHeading index={3} labels={labels} refs={headingRefs} />
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-2 text-small font-medium">{labels.budget}</legend>
            {BUDGET_KEYS.map((key) => (
              <label key={key} className="inline-flex min-h-11 items-center gap-3 text-body">
                <input type="radio" name="budget" value={key} className={choiceClass} />
                {labels.budgets[key]}
              </label>
            ))}
          </fieldset>
          {styles.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-2 text-small font-medium">{labels.style}</legend>
              <label className="inline-flex min-h-11 items-center gap-3 text-body">
                <input type="radio" name="travelStyle" value="" defaultChecked className={choiceClass} />
                {labels.styleNone}
              </label>
              {styles.map((style) => (
                <label key={style.key} className="inline-flex min-h-11 items-center gap-3 text-body">
                  <input type="radio" name="travelStyle" value={style.key} className={choiceClass} />
                  {style.name}
                </label>
              ))}
            </fieldset>
          )}
        </section>

        <section data-step={4} className={panelClass(4)} aria-labelledby="tm-step-4">
          <StepHeading index={4} labels={labels} refs={headingRefs} />
          <ContactFields idPrefix="tm" state={state} labels={labels} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="tm-country" label={labels.country} field="country" state={state} labels={labels}>
              {(aria) => <input {...aria} name="country" autoComplete="country-name" maxLength={80} className={cx(fieldClass, "h-12")} />}
            </Field>
            <Field id="tm-company" label={labels.company} field="companyName" state={state} labels={labels} hint={labels.companyHint}>
              {(aria) => <input {...aria} name="companyName" autoComplete="organization" maxLength={160} className={cx(fieldClass, "h-12")} />}
            </Field>
          </div>
          <Field id="tm-message" label={labels.message} field="message" state={state} labels={labels} hint={labels.messageHint}>
            {(aria) => <textarea {...aria} name="message" rows={5} maxLength={4000} className={cx(fieldClass, "py-3")} />}
          </Field>
          <ConsentField id="tm-consent" state={state} labels={labels} privacyHref={privacyHref} />
          <div ref={turnstile.widgetRef} />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          {ready && step > 0 && (
            <button type="button" onClick={() => go(step - 1)} className={buttonVariants({ variant: "ghost", size: "lg" })}>
              {labels.back}
            </button>
          )}
          {/* Separate keys: React would otherwise turn the clicked "next" button into the submit
              button during the click, and the browser would then submit the form. */}
          {ready && step < last ? (
            <button key="next" type="button" onClick={next} className={buttonVariants({ size: "lg" })}>
              {labels.next}
            </button>
          ) : (
            <button key="submit" type="submit" disabled={pending || turnstile.waiting} className={buttonVariants({ size: "lg" })}>
              {pending || turnstile.waiting ? labels.sending : labels.submit}
            </button>
          )}
        </div>
      </fieldset>
      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={cx("text-body focus:outline-none", state.status !== "idle" ? "font-medium text-destructive" : "text-muted-foreground")}
      >
        {statusText}
      </p>
    </form>
  );
}

function StepHeading({ index, labels, refs }: { index: number; labels: TailorMadeLabels; refs: React.RefObject<(HTMLHeadingElement | null)[]> }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-eyebrow font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {labels.stepOf.replace("{step}", String(index + 1)).replace("{count}", String(labels.steps.length))}
      </p>
      <h2
        id={`tm-step-${index}`}
        ref={(element) => {
          refs.current[index] = element;
        }}
        tabIndex={-1}
        className="font-serif text-h3 font-semibold focus:outline-none md:text-h3-lg"
      >
        {labels.stepTitles[index]}
      </h2>
    </div>
  );
}
