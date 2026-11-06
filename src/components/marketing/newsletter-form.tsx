"use client";

import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { type SubscribeState, subscribeToNewsletter } from "@/modules/content/public/newsletter.actions";

export type NewsletterLabels = {
  email: string;
  placeholder: string;
  submit: string;
  sending: string;
  privacy: string;
  unavailable: string;
  success: string;
  errors: Record<"invalidEmail" | "verification" | "rateLimited" | "unavailable" | "failed", string>;
};

type Props = { locale: "vi" | "en"; siteKey: string | null; labels: NewsletterLabels };

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once, on the visitor's first interaction with the form. */
function loadTurnstile(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

const inputClass =
  "h-12 w-full min-w-0 rounded-md border border-input bg-card px-3.5 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive";

/**
 * Email + outline button (double opt-in, ARCHITECTURE.md "Guest writes"). Cloudflare Turnstile
 * loads only when the visitor first focuses or touches the form, so no third-party request is made
 * on page load; it runs invisibly unless Cloudflare needs an interaction. A submit before the
 * token arrives waits for it. Without the services configured the form is shown disabled.
 */
export function NewsletterForm({ locale, siteKey, labels }: Props) {
  const [state, action, pending] = useActionState<SubscribeState, FormData>(subscribeToNewsletter, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const submitWhenReady = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const emailId = useId();
  const messageId = useId();
  const privacyId = useId();
  const disabled = !siteKey;

  const start = useCallback(() => {
    if (!siteKey || widgetId.current || !widgetRef.current) return;
    widgetId.current = "loading";
    loadTurnstile()
      .then((turnstile) => {
        if (!widgetRef.current) return;
        widgetId.current = turnstile.render(widgetRef.current, {
          sitekey: siteKey,
          action: "newsletter",
          appearance: "interaction-only",
          language: locale,
          callback: (value: string) => {
            setToken(value);
            if (submitWhenReady.current) {
              submitWhenReady.current = false;
              setWaiting(false);
              formRef.current?.requestSubmit();
            }
          },
          "expired-callback": () => setToken(null),
          "error-callback": () => {
            setToken(null);
            setWaiting(false);
          },
        });
      })
      .catch(() => {
        widgetId.current = null;
        setWaiting(false);
      });
  }, [siteKey, locale]);

  // A used token cannot be submitted twice: get a fresh one after every answer.
  useEffect(() => {
    if (state.status === "idle" || !widgetId.current || widgetId.current === "loading") return;
    setToken(null);
    window.turnstile?.reset(widgetId.current);
  }, [state]);

  const done = state.status === "sent";
  const error = state.status !== "idle" && state.status !== "sent" ? labels.errors[state.status] : null;
  const busy = pending || waiting;

  return (
    <form
      ref={formRef}
      action={action}
      onFocus={start}
      onPointerDown={start}
      onSubmit={(event) => {
        if (!token && siteKey) {
          event.preventDefault();
          submitWhenReady.current = true;
          setWaiting(true);
          start();
        }
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
      <div ref={widgetRef} />
      <p id={privacyId} className="text-small text-muted-foreground">
        {disabled ? labels.unavailable : labels.privacy}
      </p>
      <p id={messageId} role="status" aria-live="polite" className={done ? "text-small font-medium text-success" : "text-small font-medium text-destructive"}>
        {done ? labels.success : error}
      </p>
    </form>
  );
}
