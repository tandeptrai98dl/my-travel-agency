"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { submitKeepingValues } from "@/components/forms/submit-keeping-values";
import { useTurnstile } from "@/components/forms/use-turnstile";
import { buttonVariants } from "@/components/ui/button-variants";
import { type SubscribeState, subscribeToNewsletter } from "@/modules/content/public/newsletter.actions";

import { PolicySentence } from "./policy-sentence";

export type NewsletterLabels = {
  email: string;
  placeholder: string;
  submit: string;
  sending: string;
  /** With a `{policy}` placeholder for the link to the privacy policy. */
  privacy: string;
  privacyLink: string;
  unavailable: string;
  success: string;
  errors: Record<"invalidEmail" | "verification" | "rateLimited" | "unavailable" | "failed", string>;
};

type Props = { locale: "vi" | "en"; siteKey: string | null; privacyHref: string | null; labels: NewsletterLabels };

const inputClass =
  "h-12 w-full min-w-0 rounded-md border border-input bg-card px-3.5 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive";

/**
 * Email + outline button (double opt-in, ARCHITECTURE.md "Guest writes"). Cloudflare Turnstile
 * loads only when the visitor first focuses or touches the form, so no third-party request is made
 * on page load; it runs invisibly unless Cloudflare needs an interaction. A submit before the
 * token arrives waits for it. Without the services configured the form is shown disabled.
 */
export function NewsletterForm({ locale, siteKey, privacyHref, labels }: Props) {
  const [state, action, pending] = useActionState<SubscribeState, FormData>(subscribeToNewsletter, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const turnstile = useTurnstile({ siteKey, locale, action: "newsletter", formRef });
  const emailId = useId();
  const messageId = useId();
  const privacyId = useId();
  const disabled = !siteKey;
  const { reset } = turnstile;

  // A used token cannot be submitted twice: get a fresh one after every answer.
  useEffect(() => {
    if (state.status !== "idle") reset();
  }, [state, reset]);

  const done = state.status === "sent";
  const error = state.status !== "idle" && state.status !== "sent" ? labels.errors[state.status] : null;
  const busy = pending || turnstile.waiting;

  return (
    <form
      ref={formRef}
      action={action}
      onFocus={turnstile.start}
      onPointerDown={turnstile.start}
      onSubmit={(event) => {
        turnstile.onSubmit(event);
        // Keep what was typed when the server answers with an error (React resets form actions).
        submitKeepingValues(event, action);
      }}
      className="flex w-full max-w-xl flex-col gap-3"
    >
      <input type="hidden" name="locale" value={locale} />
      {/* Honeypot, hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <label htmlFor={emailId} className="text-small font-medium">
        {labels.email}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={emailId}
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder={labels.placeholder}
          disabled={disabled || done}
          aria-invalid={state.status === "invalidEmail" || undefined}
          aria-describedby={`${privacyId} ${messageId}`}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={disabled || done || busy}
          className={buttonVariants({ variant: "outline", size: "lg", className: "shrink-0" })}
        >
          {busy ? labels.sending : labels.submit}
        </button>
      </div>
      <div ref={turnstile.widgetRef} />
      <p id={privacyId} className="text-small text-muted-foreground">
        {disabled || !privacyHref ? labels.unavailable : <PolicySentence text={labels.privacy} href={privacyHref} link={labels.privacyLink} />}
      </p>
      <p id={messageId} role="status" aria-live="polite" className={done ? "text-small font-medium text-success" : "text-small font-medium text-destructive"}>
        {done ? labels.success : error}
      </p>
    </form>
  );
}

