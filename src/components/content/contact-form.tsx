"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { useTurnstile } from "@/components/forms/use-turnstile";
import { buttonVariants } from "@/components/ui/button-variants";
import { cx } from "@/lib/cx";
import { type ContactState, sendContactMessage } from "@/modules/inquiry/contact.actions";

export type ContactFormLabels = {
  name: string;
  email: string;
  phone: string;
  preferred: string;
  channels: Record<"email" | "phone" | "zalo" | "whatsapp", string>;
  message: string;
  /** "{code}" and "{date}" are filled from the query (`?tour=…&date=…`). */
  messageTour: string;
  messageTourDate: string;
  consent: string;
  privacyLink: string;
  newTab: string;
  submit: string;
  sending: string;
  unavailable: string;
  success: string;
  successNoCode: string;
  errors: Record<string, string>;
};

type Props = {
  locale: "vi" | "en";
  siteKey: string | null;
  privacyHref: string | null;
  labels: ContactFormLabels;
  /** From the tour page's call to action (`?tour=CODE&date=YYYY-MM-DD`), read on the server. */
  tour?: { code: string; date: string | null } | null;
};

const fieldClass =
  "w-full min-w-0 rounded-md border border-input bg-card px-3.5 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive";

/**
 * The contact form (guest write; ARCHITECTURE "Guest writes"). Turnstile loads on the first
 * interaction and a submit waits for its token. Field errors come back from the server and are
 * linked to their fields. A tour from the tour page's call to action prefills the message. Shown
 * disabled while the services are not configured.
 */
export function ContactForm({ locale, siteKey, privacyHref, labels, tour = null }: Props) {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContactMessage, { status: "idle" });
  const tourCode = tour?.code ?? "";
  const date = tour?.date ?? "";
  const prefill = tourCode
    ? (date ? labels.messageTourDate.replace("{date}", date.split("-").reverse().join("/")) : labels.messageTour).replace("{code}", tourCode)
    : "";

  const formRef = useRef<HTMLFormElement>(null);
  const turnstile = useTurnstile({ siteKey, locale, action: "contact", formRef });
  const { reset } = turnstile;
  const statusRef = useRef<HTMLParagraphElement>(null);
  const ids = { name: useId(), email: useId(), phone: useId(), message: useId(), consent: useId(), status: useId() };
  const disabled = !siteKey;
  const done = state.status === "sent";
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.status === "idle") return;
    reset();
    // Field errors: focus the first invalid field; other answers: the status line.
    const first = (["name", "email", "phone", "message", "consent"] as const).find((field) => errors[field]);
    if (first) document.getElementById(ids[first])?.focus();
    else statusRef.current?.focus();
    // ids are stable; errors come with state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const error = (field: keyof typeof ids) =>
    errors[field as keyof typeof errors] ? (
      <p id={`${ids[field]}-error`} className="text-small text-destructive">
        {labels.errors[errors[field as keyof typeof errors]!] ?? labels.errors.invalid}
      </p>
    ) : null;
  const describedBy = (field: keyof typeof ids) => (errors[field as keyof typeof errors] ? `${ids[field]}-error` : undefined);

  const statusText = done
    ? state.code
      ? labels.success.replace("{code}", state.code)
      : labels.successNoCode
    : state.status !== "idle"
      ? labels.errors[state.status] ?? labels.errors.failed
      : disabled
        ? labels.unavailable
        : "";

  return (
    <form
      ref={formRef}
      action={action}
      noValidate
      onFocus={turnstile.start}
      onPointerDown={turnstile.start}
      onSubmit={turnstile.onSubmit}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="tourCode" value={tourCode} />
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <fieldset disabled={disabled || done} className="flex flex-col gap-5 disabled:opacity-80">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.name} className="text-small font-medium">{labels.name}</label>
            <input id={ids.name} name="name" required autoComplete="name" maxLength={120} aria-invalid={errors.name ? true : undefined} aria-describedby={describedBy("name")} className={cx(fieldClass, "h-12")} />
            {error("name")}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.email} className="text-small font-medium">{labels.email}</label>
            <input id={ids.email} name="email" type="email" required autoComplete="email" inputMode="email" maxLength={254} aria-invalid={errors.email ? true : undefined} aria-describedby={describedBy("email")} className={cx(fieldClass, "h-12")} />
            {error("email")}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.phone} className="text-small font-medium">{labels.phone}</label>
          <input id={ids.phone} name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} aria-invalid={errors.phone ? true : undefined} aria-describedby={describedBy("phone")} className={cx(fieldClass, "h-12 sm:max-w-xs")} />
          {error("phone")}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-small font-medium">{labels.preferred}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(Object.keys(labels.channels) as (keyof typeof labels.channels)[]).map((channel) => (
              <label key={channel} className="inline-flex min-h-11 items-center gap-2 text-body">
                <input type="radio" name="preferredContact" value={channel} defaultChecked={channel === "email"} className="h-5 w-5 accent-[hsl(var(--primary))]" />
                {labels.channels[channel]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.message} className="text-small font-medium">{labels.message}</label>
          <textarea id={ids.message} name="message" required rows={6} maxLength={4000} defaultValue={prefill} aria-invalid={errors.message ? true : undefined} aria-describedby={describedBy("message")} className={cx(fieldClass, "py-3")} />
          {error("message")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.consent} className="flex items-start gap-3 text-small">
            <input id={ids.consent} name="consent" type="checkbox" required aria-invalid={errors.consent ? true : undefined} aria-describedby={describedBy("consent")} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" />
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
          {error("consent")}
        </div>
        <div ref={turnstile.widgetRef} />
        <button type="submit" disabled={pending || turnstile.waiting} className={buttonVariants({ size: "lg", className: "self-start" })}>
          {pending || turnstile.waiting ? labels.sending : labels.submit}
        </button>
      </fieldset>
      <p
        id={ids.status}
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={cx("text-body focus:outline-none", done ? "font-medium text-success" : state.status !== "idle" ? "font-medium text-destructive" : "text-muted-foreground")}
      >
        {statusText}
      </p>
    </form>
  );
}
