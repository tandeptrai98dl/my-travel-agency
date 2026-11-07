"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { useSubmitWithoutReset } from "@/components/forms/use-submit-without-reset";
import { useTurnstile } from "@/components/forms/use-turnstile";
import { buttonVariants } from "@/components/ui/button-variants";
import { cx } from "@/lib/cx";
import type { sendInquiry } from "@/modules/inquiry/tailor-made.actions";
import type { InquiryState } from "@/modules/inquiry/tailor-made.schemas";

import type { InquirySuccessLabels } from "./inquiry-success";
import { LazyInquirySuccess, preloadInquirySuccess } from "./inquiry-success-lazy";
import { ConsentField, ContactFields, Field, fieldClass, Honeypot, type InquiryContactLabels, monthLabel, upcomingMonths } from "./inquiry-fields";

export type TourInquiryLabels = InquiryContactLabels & { monthUndecided: string; messagePlaceholder: string; submit: string; success: InquirySuccessLabels };

type Props = {
  locale: "vi" | "en";
  tourCode: string;
  siteKey: string | null;
  privacyHref: string | null;
  labels: TourInquiryLabels;
  /**
   * The Server Action, passed down from the page. Importing it here would pull Next.js's action
   * client into this lazy chunk's graph, and Turbopack then splits those modules out of the shared
   * router chunk on every page (+0.3 KB gzip; /tours went over the 150 KB budget).
   */
  sendInquiry: typeof sendInquiry;
};

/**
 * The inquiry form on a private tour's page (Phase 5 PR 5W): the tour is known, so it asks only
 * for the month, the party and how to reply. Saved as an inquiry with `source = 'tour_inquiry'`.
 */
export function TourInquiryForm({ locale, tourCode, siteKey, privacyHref, labels, sendInquiry }: Props) {
  const [state, action, pending] = useActionState<InquiryState, FormData>(sendInquiry, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const turnstile = useTurnstile({ siteKey, locale, action: "inquiry", formRef });
  const { reset } = turnstile;
  const onSubmit = useSubmitWithoutReset(action, turnstile.onSubmit);
  const [months, setMonths] = useState<string[]>([]);
  const disabled = !siteKey;

  useEffect(() => setMonths(upcomingMonths()), []);
  useEffect(() => {
    if (pending) preloadInquirySuccess();
  }, [pending]);
  useEffect(() => {
    if (state.status === "idle" || state.status === "sent") return;
    reset();
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? statusRef.current)?.focus();
  }, [state, reset]);

  if (state.status === "sent") return <LazyInquirySuccess code={state.code ?? null} labels={labels.success} locale={locale} source="tour_inquiry" />;
  const statusText = state.status !== "idle" ? (labels.errors[state.status] ?? labels.errors.failed) : disabled ? labels.unavailable : "";

  return (
    <form ref={formRef} action={action} noValidate onFocus={turnstile.start} onPointerDown={turnstile.start} onSubmit={onSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="source" value="tour_inquiry" />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="tourCode" value={tourCode} />
      <Honeypot />
      <fieldset disabled={disabled} className="flex flex-col gap-5 disabled:opacity-80">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="ti-month" label={labels.month} field="travelMonth" state={state} labels={labels}>
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
          <Field id="ti-adults" label={labels.adults} field="adults" state={state} labels={labels}>
            {(aria) => <input {...aria} name="adults" type="number" inputMode="numeric" required min={1} max={50} defaultValue={2} className={cx(fieldClass, "h-12")} />}
          </Field>
          <Field id="ti-children" label={labels.children} field="children" state={state} labels={labels}>
            {(aria) => <input {...aria} name="children" type="number" inputMode="numeric" min={0} max={50} defaultValue={0} className={cx(fieldClass, "h-12")} />}
          </Field>
        </div>
        <input type="hidden" name="flexibleDates" value="on" />
        <ContactFields idPrefix="ti" state={state} labels={labels} />
        <Field id="ti-message" label={labels.message} field="message" state={state} labels={labels}>
          {(aria) => <textarea {...aria} name="message" rows={4} maxLength={4000} placeholder={labels.messagePlaceholder} className={cx(fieldClass, "py-3")} />}
        </Field>
        <ConsentField id="ti-consent" state={state} labels={labels} privacyHref={privacyHref} />
        <div ref={turnstile.widgetRef} />
        <button type="submit" disabled={pending || turnstile.waiting} className={buttonVariants({ size: "lg", className: "self-start" })}>
          {pending || turnstile.waiting ? labels.sending : labels.submit}
        </button>
      </fieldset>
      <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className={cx("text-body focus:outline-none", state.status !== "idle" ? "font-medium text-destructive" : "text-muted-foreground")}>
        {statusText}
      </p>
    </form>
  );
}
